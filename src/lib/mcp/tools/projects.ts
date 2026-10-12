// Project MCP write tools: post_status_update, update_project, log_time. Budget writes are
// deliberately NOT exposed -- financial entries stay a human action in the app. Every query and write goes through ctx.supabase -- the USER-SCOPED client --
// so RLS decides rights exactly as in the app (PM on own projects, finance on budgets, own time
// only). Writes mirror the app's actions (src/app/actions/{projects,time-entries}.ts):
// the same zod schemas (src/lib/validation/*), the same has_permission pre-checks the actions run
// via requirePermission (here only to turn a refusal into a clear message -- RLS re-checks every
// write), the same table writes and revalidated pages. Each write is audited through ctx.audit
// (via=mcp, key_id added by the server).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appUrl, compact, fmtDate, toText } from "@/lib/mcp/format";
import { WRITE_NOTE, parseWith } from "@/lib/mcp/tools/sales";
import { defineTool, ToolError, type ToolContext, type ToolDef } from "@/lib/mcp/types";
import { replaceVisibleTags, visibleProjectTags } from "@/lib/project-icons";
import { pickProvided } from "@/lib/sales/pick-provided";
import { PROJECT_STATUS_OPTIONS, editProjectSchema, statusUpdateSchema } from "@/lib/validation/project";
import { timeEntrySchema } from "@/lib/validation/time-entry";
import type { Permission } from "@/lib/auth/permissions";

// ---------------------------------------------------------------------------------------------
// Input building blocks (plain, so they convert cleanly to JSON Schema; the app's schemas then
// validate inside each handler).

const uuid = (what: string) => z.uuid({ message: `${what} must be an id (uuid) -- use search or list_projects to find it` });
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const statusText = z.string().trim().max(4000).optional();

// ---------------------------------------------------------------------------------------------
// Helpers

/** Throws a friendly ToolError for a failed read; the raw message only goes to the server log.
 * PGRST301 ("JWT invalid/expired") means the user-scoped client's minted token was rejected by
 * PostgREST -- not a transient DB error, so it gets its own actionable message instead of the
 * generic "try again". */
function check(error: { message: string; code?: string } | null, what: string): void {
  if (error) {
    console.error(`mcp projects ${what} failed:`, error.message);
    if (error.code === "PGRST301") {
      throw new ToolError("Server misconfiguration (token rejected) — contact an admin.");
    }
    throw new ToolError(`Could not load ${what}. Try again.`);
  }
}

function notFound(what: string): never {
  throw new ToolError(`${what} not found, or you don't have access to it.`);
}

export const NO_EDIT_PROJECT = "You can't edit this project. Only its project manager or an admin can change it.";
export const NO_EDIT_STATUS = "You can't post status updates on this project. Only its project manager or an admin can.";
export const NO_LOG_TIME = "You don't have permission to log time.";

/** has_permission through the user-scoped client, as the app's requirePermission does. */
async function requirePerm(ctx: ToolContext, perm: Permission, projectId: string | null, message: string): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("has_permission", {
    uid: ctx.userId,
    perm,
    ...(projectId ? { project: projectId } : {}),
  });
  if (error) {
    console.error("mcp projects permission check failed:", error.message);
    throw new ToolError("Could not check your access. Try again.");
  }
  if (data !== true) throw new ToolError(message);
}

/** Marks pages for revalidation (route handler: refreshed on the next visit). A failure here
 * never fails the write. */
function revalidate(...paths: ([string] | [string, "layout" | "page"])[]): void {
  for (const [path, type] of paths) {
    try {
      revalidatePath(path, type);
    } catch (err) {
      console.error("mcp projects revalidate failed:", err instanceof Error ? err.message : err);
    }
  }
}

const projectUrl = (id: string, tab?: string) => appUrl(`/projects/${id}${tab ? `/${tab}` : ""}`);

async function projectName(ctx: ToolContext, id: string): Promise<string | null> {
  const { data } = await ctx.supabase.from("projects").select("name").eq("id", id).maybeSingle();
  return data?.name ?? null;
}

// ---------------------------------------------------------------------------------------------
// update_project field allowlist

/** The ONLY projects columns update_project may write. pm_id, client_id, health, progress, budget
 * fields, notes etc. are deliberately absent (not settable over MCP). */
export const UPDATABLE_PROJECT_FIELDS = ["name", "description", "status", "start_date", "deadline", "tags"] as const;
type UpdatableField = (typeof UPDATABLE_PROJECT_FIELDS)[number];

const projectFieldsSchema = editProjectSchema.pick({
  name: true,
  description: true,
  status: true,
  start_date: true,
  deadline: true,
  tags: true,
}).partial();

export type ProjectPatch = {
  name?: string;
  description?: string | null;
  status?: (typeof PROJECT_STATUS_OPTIONS)[number];
  start_date?: string | null;
  deadline?: string | null;
  tags?: string[];
};

/** Builds the projects UPDATE patch: validates the provided allowlisted fields with the app's
 * editProjectSchema, keeps only keys the caller actually sent, and rewrites tags so the hidden
 * `_icon:` tag stored on the project survives. Any key outside the allowlist is ignored here
 * (the tool's strict input schema rejects it before this runs). */
export function buildProjectPatch(input: Record<string, unknown>, currentTags: string[] | null): ProjectPatch {
  const raw: Record<string, unknown> = {};
  for (const key of UPDATABLE_PROJECT_FIELDS) {
    if (Object.hasOwn(input, key) && input[key] !== undefined) raw[key] = input[key];
  }
  const parsed = pickProvided(parseWith(projectFieldsSchema, raw) as Record<UpdatableField, unknown>, raw) as ProjectPatch;
  if (parsed.tags !== undefined) parsed.tags = replaceVisibleTags(currentTags, parsed.tags);
  return parsed;
}

/** start_date must not be after deadline, judged on the values the project will have after the
 * update (a side that isn't sent keeps its current value). */
export function assertDateOrder(
  patch: Pick<ProjectPatch, "start_date" | "deadline">,
  current: { start_date: string | null; deadline: string | null }
): void {
  const start = patch.start_date !== undefined ? patch.start_date : current.start_date;
  const end = patch.deadline !== undefined ? patch.deadline : current.deadline;
  if (start && end && start > end) {
    throw new ToolError(`The start date (${fmtDate(start)}) can't be after the deadline (${fmtDate(end)}).`);
  }
}

// ---------------------------------------------------------------------------------------------
// Tools

const postStatusUpdate = defineTool({
  name: "post_status_update",
  title: "Post status update",
  description: `${WRITE_NOTE} Posts a status update on a project (as you). Fill at least one section: completed, in_progress, blockers, decisions_needed, next_milestone, handover_info. Posted updates can't be edited here.`,
  inputSchema: z.object({
    project_id: uuid("project_id"),
    completed: statusText.describe("What was completed"),
    in_progress: statusText.describe("What is in progress"),
    blockers: statusText.describe("Blockers"),
    decisions_needed: statusText.describe("Decisions needed from the client or team"),
    next_milestone: statusText.describe("Next milestone"),
    handover_info: statusText.describe("Handover notes"),
  }),
  readOnly: false,
  handler: async ({ project_id, ...sections }, ctx) => {
    await requirePerm(ctx, "edit_status", project_id, NO_EDIT_STATUS);
    const fields = parseWith(statusUpdateSchema, sections);
    const { data, error } = await ctx.supabase
      .from("project_status_updates")
      .insert({ project_id, author_id: ctx.userId, ...fields })
      .select("id, created_at")
      .single();
    if (error || !data) {
      if (error) console.error("mcp post_status_update failed:", error.code, error.message);
      throw new ToolError("Post failed. Try again.");
    }
    await ctx.audit({ action: "project.status_posted", resourceType: "project", resourceId: project_id, metadata: { status_update_id: data.id } });
    revalidate([`/projects/${project_id}`]);
    return toText({ result: "Status update posted", project: await projectName(ctx, project_id), date: fmtDate(data.created_at), url: projectUrl(project_id) });
  },
});

const updateProject = defineTool({
  name: "update_project",
  title: "Update project",
  description: `${WRITE_NOTE} Changes a project's name, description, status, start_date, deadline or tags. Only the fields you pass change; tags replaces the whole tag list. If the project has a start/end milestone, the date is moved on that milestone too. PM, client, health, progress and budget can't be changed here.`,
  inputSchema: z
    .object({
      project_id: uuid("project_id"),
      name: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(4000).nullable().optional().describe("null clears it"),
      status: z.enum(PROJECT_STATUS_OPTIONS).optional(),
      start_date: dateKey.nullable().optional().describe("YYYY-MM-DD; null clears it"),
      deadline: dateKey.nullable().optional().describe("YYYY-MM-DD; null clears it"),
      tags: z.array(z.string().trim().min(1).max(50)).max(20).optional().describe("The full new tag list"),
    })
    .strict(),
  readOnly: false,
  handler: async ({ project_id, ...fields }, ctx) => {
    if (!UPDATABLE_PROJECT_FIELDS.some((k) => fields[k] !== undefined)) {
      throw new ToolError(`Pass at least one field to change: ${UPDATABLE_PROJECT_FIELDS.join(", ")}.`);
    }
    await requirePerm(ctx, "edit_project", project_id, NO_EDIT_PROJECT);
    const { data: current, error: curError } = await ctx.supabase
      .from("projects")
      .select("id, name, tags, start_date, deadline")
      .eq("id", project_id)
      .maybeSingle();
    check(curError, "the project");
    if (!current) notFound("Project");
    const patch = buildProjectPatch(fields, current.tags);
    assertDateOrder(patch, current);

    // start_date/deadline are derived from the start/end milestones by a DB trigger (the edit
    // dialog edits milestones, not the columns). A milestone-backed date is therefore written by
    // moving the milestone (the trigger syncs the column) -- otherwise the next dialog save would
    // put the old date back. Clearing a milestone-backed date is refused.
    const milestoneMoves: { id: string; field: "start_date" | "deadline"; due_on: string }[] = [];
    const dateKinds = [["start_date", "start"], ["deadline", "end"]] as const;
    if (dateKinds.some(([field]) => field in patch)) {
      const { data: ms, error: msError } = await ctx.supabase
        .from("project_milestones")
        .select("id, name, kind")
        .eq("project_id", project_id)
        .in("kind", ["start", "end"]);
      check(msError, "the project's milestones");
      for (const [field, kind] of dateKinds) {
        if (!(field in patch)) continue;
        const m = (ms ?? []).find((x) => x.kind === kind);
        if (!m) continue;
        const value = patch[field];
        if (!value) {
          throw new ToolError(`The ${field === "deadline" ? "deadline" : "start date"} comes from the "${m.name}" milestone. Give a new date instead of clearing it.`);
        }
        milestoneMoves.push({ id: m.id, field, due_on: value });
      }
    }

    // Every path that wrote something is audited -- a failure after a partial write records
    // exactly what changed (metadata.partial) before the friendly error.
    const written: ProjectPatch = {};
    const auditWritten = async (partial: boolean) => {
      const audited = { ...written, ...(written.tags ? { tags: visibleProjectTags(written.tags) } : {}) };
      await ctx.audit({
        action: written.status === "archived" ? "project.archived" : "project.updated",
        resourceType: "project",
        resourceId: project_id,
        metadata: { fields: audited, ...(partial ? { partial: true } : {}) },
      });
    };
    const fail = async (message: string): Promise<never> => {
      if (Object.keys(written).length) await auditWritten(true);
      throw new ToolError(message);
    };

    // 1. Milestones first (the trigger syncs the date columns).
    for (const move of milestoneMoves) {
      const { data: moved, error: mError } = await ctx.supabase
        .from("project_milestones")
        .update({ due_on: move.due_on })
        .eq("id", move.id)
        .eq("project_id", project_id)
        .select("id")
        .maybeSingle();
      if (mError || !moved) {
        if (mError) console.error("mcp update_project milestone move failed:", mError.code, mError.message);
        await fail(mError ? "Update failed. Try again." : NO_EDIT_PROJECT);
      }
      written[move.field] = move.due_on;
    }

    // 2. Then the project's own columns (milestone-backed dates are already written).
    const projectPatch: ProjectPatch = { ...patch };
    for (const move of milestoneMoves) delete projectPatch[move.field];
    if (Object.keys(projectPatch).length) {
      const { data: updated, error } = await ctx.supabase.from("projects").update(projectPatch).eq("id", project_id).select("id").maybeSingle();
      if (error || !updated) {
        if (error) console.error("mcp update_project failed:", error.code, error.message);
        await fail(
          Object.keys(written).length
            ? "Only the milestone date was changed; saving the other fields failed. Try again."
            : error ? "Update failed. Try again." : NO_EDIT_PROJECT
        );
      }
      Object.assign(written, projectPatch);
    }

    await auditWritten(false);
    revalidate(["/projects"], ["/projects/[id]", "layout"]);
    return toText(
      compact({
        result: "Project updated",
        project: patch.name ?? current.name,
        changed: Object.keys(patch).join(", "),
        start_date: patch.start_date !== undefined ? (fmtDate(patch.start_date) ?? "cleared") : null,
        deadline: patch.deadline !== undefined ? (fmtDate(patch.deadline) ?? "cleared") : null,
        url: projectUrl(project_id),
      })
    );
  },
});

const logTime = defineTool({
  name: "log_time",
  title: "Log time",
  description: `${WRITE_NOTE} Logs your hours on a project for a month (one monthly total, as in the app; dated the 1st of the month). Only your own time, on projects you're a member of or assigned to. Billable defaults to true.`,
  inputSchema: z.object({
    project_id: uuid("project_id"),
    month: z.string().regex(MONTH, "Use YYYY-MM").describe("YYYY-MM"),
    hours: z.number().describe("Hours worked that month (more than 0, at most 744)"),
    person: z.string().trim().min(1).max(100).optional().describe('Whose time: only "me" (your own) is allowed; default "me"'),
    part_id: uuid("part_id").optional().describe("Project part the hours belong to (optional)"),
    billable: z.boolean().optional(),
    description: z.string().max(2000).optional(),
  }),
  readOnly: false,
  handler: async (input, ctx) => {
    await requirePerm(ctx, "log_time", null, NO_LOG_TIME);
    const fields = parseWith(timeEntrySchema, {
      project_id: input.project_id,
      project_part_id: input.part_id ?? null,
      entry_date: `${input.month}-01`,
      hours: input.hours,
      billable: input.billable ?? true,
      description: input.description ?? null,
    });
    // person_id is always the caller's own people row (as logTimeAction), never taken from input.
    const { data: personId, error: personError } = await ctx.supabase.rpc("current_person_id");
    if (personError || !personId) throw new ToolError("Your account isn't linked to a person record. Ask an admin.");
    const ref = input.person?.trim();
    if (ref && ref.toLowerCase() !== "me" && ref !== personId) {
      throw new ToolError('You can only log your own time. Leave person out (or pass "me").');
    }
    if (fields.project_part_id) {
      const { data: part, error: partError } = await ctx.supabase
        .from("project_parts")
        .select("id")
        .eq("id", fields.project_part_id)
        .eq("project_id", fields.project_id)
        .maybeSingle();
      check(partError, "the project part");
      if (!part) throw new ToolError("That part doesn't belong to this project, or you can't see it.");
    }
    const { data: entry, error } = await ctx.supabase
      .from("time_entries")
      .insert({ person_id: personId, ...fields })
      .select("id")
      .single();
    if (error || !entry) {
      if (error) console.error("mcp log_time failed:", error.code, error.message);
      throw new ToolError(
        !error || error.code === "42501" ? "You can only log time on projects you're a member of or assigned to." : "Save failed. Try again."
      );
    }
    await ctx.audit({
      action: "time.logged",
      resourceType: "time_entry",
      resourceId: String(entry.id),
      metadata: { project_id: fields.project_id, project_part_id: fields.project_part_id, hours: fields.hours, billable: fields.billable },
    });
    revalidate([`/people/${personId}`]);
    return toText({
      result: "Time logged",
      entry_id: entry.id,
      project: await projectName(ctx, fields.project_id),
      month: input.month,
      hours: fields.hours,
      billable: fields.billable,
      url: appUrl(`/people/${personId}`),
    });
  },
});

export const PROJECT_WRITE_TOOLS: ToolDef[] = [postStatusUpdate, updateProject, logTime];
