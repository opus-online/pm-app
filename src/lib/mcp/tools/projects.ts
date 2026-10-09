// Project MCP write tools: post_status_update, update_project, log_time, add_budget_item,
// update_budget_item. Every query and write goes through ctx.supabase -- the USER-SCOPED client --
// so RLS decides rights exactly as in the app (PM on own projects, finance on budgets, own time
// only). Writes mirror the app's actions (src/app/actions/{projects,time-entries,budget-items}.ts):
// the same zod schemas (src/lib/validation/*), the same has_permission pre-checks the actions run
// via requirePermission (here only to turn a refusal into a clear message -- RLS re-checks every
// write), the same table writes and revalidated pages. Each write is audited through ctx.audit
// (via=mcp, key_id added by the server).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureProjectBudgetId } from "@/lib/budget-row";
import { appUrl, compact, fmtDate, toText } from "@/lib/mcp/format";
import { WRITE_NOTE, parseWith } from "@/lib/mcp/tools/sales";
import { defineTool, ToolError, type ToolContext, type ToolDef } from "@/lib/mcp/types";
import { replaceVisibleTags, visibleProjectTags } from "@/lib/project-icons";
import { pickProvided } from "@/lib/sales/pick-provided";
import { BUDGET_ITEM_TYPE_OPTIONS, COST_BUDGET_ITEM_TYPES, budgetItemSchema } from "@/lib/validation/budget";
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

/** Throws a friendly ToolError for a failed read; the raw message only goes to the server log. */
function check(error: { message: string } | null, what: string): void {
  if (error) {
    console.error(`mcp projects ${what} failed:`, error.message);
    throw new ToolError(`Could not load ${what}. Try again.`);
  }
}

function notFound(what: string): never {
  throw new ToolError(`${what} not found, or you don't have access to it.`);
}

export const NO_EDIT_PROJECT = "You can't edit this project. Only its project manager or an admin can change it.";
export const NO_EDIT_STATUS = "You can't post status updates on this project. Only its project manager or an admin can.";
export const NO_LOG_TIME = "You don't have permission to log time.";
export const NO_MANAGE_BUDGET = "You don't have permission to change this project's budget.";
export const NO_INTERNAL_COST = "Only finance can record or change internal costs (planned_cost / actual_cost).";

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
      .select("id, name, tags")
      .eq("id", project_id)
      .maybeSingle();
    check(curError, "the project");
    if (!current) notFound("Project");
    const patch = buildProjectPatch(fields, current.tags);

    // start_date/deadline are derived from the start/end milestones by a DB trigger (the edit
    // dialog edits milestones, not the columns). Move the matching milestone too, so the next
    // dialog save doesn't put the old date back; clearing a milestone-backed date is refused.
    const milestoneMoves: { id: string; due_on: string }[] = [];
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
        milestoneMoves.push({ id: m.id, due_on: value });
      }
    }

    const { data: updated, error } = await ctx.supabase.from("projects").update(patch).eq("id", project_id).select("id").maybeSingle();
    if (error || !updated) {
      if (error) console.error("mcp update_project failed:", error.code, error.message);
      throw new ToolError(error ? "Update failed. Try again." : NO_EDIT_PROJECT);
    }
    for (const move of milestoneMoves) {
      const { error: mError } = await ctx.supabase.from("project_milestones").update({ due_on: move.due_on }).eq("id", move.id).eq("project_id", project_id);
      if (mError) {
        console.error("mcp update_project milestone move failed:", mError.code, mError.message);
        throw new ToolError("The project was updated, but moving its milestone date failed. Check the timeline in the app.");
      }
    }

    const audited = { ...patch, ...(patch.tags ? { tags: visibleProjectTags(patch.tags) } : {}) };
    await ctx.audit({ action: "project.updated", resourceType: "project", resourceId: project_id, metadata: { fields: audited } });
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

const isCostType = (t: string) => (COST_BUDGET_ITEM_TYPES as readonly string[]).includes(t);

const addBudgetItem = defineTool({
  name: "add_budget_item",
  title: "Add budget item",
  description: `${WRITE_NOTE} Adds an entry to a project's budget: invoice, payment or change (scope change; amount may be negative), or -- finance only -- planned_cost / actual_cost. Amount in EUR. Needs budget rights on the project.`,
  inputSchema: z.object({
    project_id: uuid("project_id"),
    item_type: z.enum(BUDGET_ITEM_TYPE_OPTIONS),
    name: z.string().trim().min(1).max(200),
    amount: z.number().describe("EUR; negative allowed (e.g. a scope reduction)"),
    occurred_on: dateKey.describe("YYYY-MM-DD"),
    note: z.string().max(2000).optional(),
  }),
  readOnly: false,
  handler: async ({ project_id, ...input }, ctx) => {
    await requirePerm(ctx, "manage_budget", project_id, NO_MANAGE_BUDGET);
    const item = parseWith(budgetItemSchema, { ...input, note: input.note ?? null });
    if (isCostType(item.item_type)) await requirePerm(ctx, "view_internal_cost", project_id, NO_INTERNAL_COST);

    const budget = await ensureProjectBudgetId(ctx.supabase, project_id);
    if ("error" in budget) throw new ToolError(`${budget.error} Try again.`);
    const { data, error } = await ctx.supabase
      .from("budget_items")
      .insert({ budget_id: budget.id, created_by: ctx.userId, ...item })
      .select("id")
      .single();
    if (error || !data) {
      if (error) console.error("mcp add_budget_item failed:", error.code, error.message);
      throw new ToolError(error?.code === "42501" ? NO_MANAGE_BUDGET : "Save failed. Try again.");
    }
    await ctx.audit({
      action: "budget_item.added",
      resourceType: "budget_item",
      resourceId: String(data.id),
      metadata: { project_id, budget_id: budget.id, item_type: item.item_type, amount: item.amount },
    });
    revalidate([`/projects/${project_id}/budget`]);
    return toText({
      result: "Budget item added",
      item_id: data.id,
      item_type: item.item_type,
      amount_eur: item.amount,
      date: fmtDate(item.occurred_on),
      url: projectUrl(project_id, "budget"),
    });
  },
});

const budgetItemFieldsSchema = budgetItemSchema.pick({ name: true, amount: true, occurred_on: true, note: true }).partial();

const updateBudgetItem = defineTool({
  name: "update_budget_item",
  title: "Update budget item",
  description: `${WRITE_NOTE} Changes a budget entry's name, amount (EUR), date or note. Only the fields you pass change. The type (invoice/payment/...) can't be changed. Needs budget rights on the project; cost entries are finance only. Find item ids with get_budget.`,
  inputSchema: z
    .object({
      item_id: z.number().int().positive().describe("Budget item id"),
      name: z.string().trim().min(1).max(200).optional(),
      amount: z.number().optional().describe("EUR"),
      occurred_on: dateKey.optional().describe("YYYY-MM-DD"),
      note: z.string().max(2000).nullable().optional().describe("null clears it"),
    })
    .strict(),
  readOnly: false,
  handler: async ({ item_id, ...input }, ctx) => {
    const raw = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    if (!Object.keys(raw).length) throw new ToolError("Pass at least one field to change: name, amount, occurred_on, note.");
    const patch = pickProvided(parseWith(budgetItemFieldsSchema, raw), raw);

    const { data: item, error: itemError } = await ctx.supabase
      .from("budget_items")
      .select("id, item_type, budget_id, budgets(project_id)")
      .eq("id", item_id)
      .maybeSingle();
    check(itemError, "the budget item");
    const projectId = item?.budgets?.project_id;
    if (!item || !projectId) notFound("Budget item");
    await requirePerm(ctx, "manage_budget", projectId, NO_MANAGE_BUDGET);
    if (isCostType(item.item_type)) await requirePerm(ctx, "view_internal_cost", projectId, NO_INTERNAL_COST);

    const { data, error } = await ctx.supabase.from("budget_items").update(patch).eq("id", item_id).select("id").maybeSingle();
    if (error || !data) {
      if (error) console.error("mcp update_budget_item failed:", error.code, error.message);
      throw new ToolError(!error || error.code === "42501" ? NO_MANAGE_BUDGET : "Update failed. Try again.");
    }
    await ctx.audit({
      action: "budget_item.updated",
      resourceType: "budget_item",
      resourceId: String(item_id),
      metadata: { project_id: projectId, item_type: item.item_type, fields: patch },
    });
    revalidate([`/projects/${projectId}/budget`]);
    return toText({ result: "Budget item updated", item_id, changed: Object.keys(patch).join(", "), url: projectUrl(projectId, "budget") });
  },
});

export const PROJECT_WRITE_TOOLS: ToolDef[] = [postStatusUpdate, updateProject, logTime, addBudgetItem, updateBudgetItem];
