// Sales MCP tools: reads (sales_overview, get_company, my_next_steps) and writes (steps, activity
// log, leads, deals, offers). Every query and write goes through ctx.supabase -- the USER-SCOPED
// client -- so RLS and the SECURITY DEFINER RPCs' own manage_sales/assignee checks apply exactly as
// in the app. Writes mirror src/app/actions/sales.ts: the same zod schemas (src/lib/validation/
// sales.ts), the same RPCs/table writes, the same ownership checks and error mappers
// (src/lib/sales/{ownership,rpc-errors,lead-input}.ts). actor_id is never sent (DB default +
// RLS pin it to the key's user). Each write is audited through ctx.audit (via=mcp, key_id).
import { z } from "zod";
import { appDayKey } from "@/lib/time-zone";
import { MAX_ROWS, appUrl, compact, fmtDate, listResult, toText } from "@/lib/mcp/format";
import { defineTool, ToolError, type ToolContext, type ToolDef } from "@/lib/mcp/types";
import { fetchCompanyRows } from "@/lib/sales/company-rows";
import { matchesCompanyQuery, matchesStepFilter } from "@/lib/sales/list-filters";
import { toNextStep, type NextStep, type StepPerson } from "@/lib/sales/next-step";
import { assertStepRefsBelongToClient, existingByRegCode } from "@/lib/sales/ownership";
import { prepareLeadInput } from "@/lib/sales/lead-input";
import { pickProvided } from "@/lib/sales/pick-provided";
import { offersNewestFirst } from "@/lib/sales/pipeline";
import {
  mapConvertEntryError,
  mapCreateLeadError,
  mapDealUpdateError,
  mapPlanStepInsertError,
  mapRound3RpcError,
  mapStepRpcError,
} from "@/lib/sales/rpc-errors";
import { revalidateSales } from "@/lib/sales/revalidate";
import { timelineAt } from "@/lib/sales/timeline-filter";
import { ACTIVITY_KINDS, CLOSED_STAGES, DEAL_SOURCES, DEAL_STAGES, OFFER_STATUSES } from "@/lib/sales/types";
import { compareDueDates, daysUntil } from "@/lib/sales/urgency";
import {
  activitySchema,
  cancelStepSchema,
  completeStepSchema,
  convertEntrySchema,
  dealUpdateSchema,
  newLeadSchema,
  offerSchema,
  planStepSchema,
  updateStepSchema,
  type NewLeadInput,
} from "@/lib/validation/sales";

// ---------------------------------------------------------------------------------------------
// Input building blocks. Tool input schemas are plain (no preprocess/transform) so they convert
// cleanly to JSON Schema for the client; the app's own schemas then validate inside each handler.

const uuid = (what: string) => z.uuid({ message: `${what} must be an id (uuid) -- use sales_overview or get_company to find it` });
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const kind = z.enum(ACTIVITY_KINDS).describe("call, email, meeting or note");
const personRef = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .describe('"me", a user id, or a Sales person\'s name (must match exactly one person)');
const optText = (max: number) => z.string().trim().max(max).optional();
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const WRITE_NOTE = "CHANGES DATA -- confirm with the user first.";

// ---------------------------------------------------------------------------------------------
// Helpers

/** Throws a friendly ToolError for a failed read; the raw message only goes to the server log.
 * PGRST301 ("JWT invalid/expired") means the user-scoped client's minted token was rejected by
 * PostgREST -- not a transient DB error, so it gets its own actionable message instead of the
 * generic "try again". */
function check(error: { message: string; code?: string } | null, what: string): void {
  if (error) {
    console.error(`mcp sales ${what} failed:`, error.message);
    if (error.code === "PGRST301") {
      throw new ToolError("Server misconfiguration (token rejected) — contact an admin.");
    }
    throw new ToolError(`Could not load ${what}. Try again.`);
  }
}

function notFound(what: string): never {
  throw new ToolError(`${what} not found, or you don't have access to it.`);
}

/** Parses with one of the app's schemas; the first issue becomes a ToolError. */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new ToolError(`Invalid input. ${where}${issue?.message ?? ""}`.trim());
  }
  return parsed.data;
}

export const NO_VIEW_SALES = "You don't have access to Sales.";
export const NO_MANAGE_SALES = "You don't have permission to change Sales data. Ask an admin for Sales access.";

/** Permission gate through the user-scoped client (has_permission RPC, as the app's
 * getSalesAccess/requirePermission). RLS and the RPCs re-check on every read/write anyway; this
 * only turns "nothing visible / 0 rows changed" into a clear message before anything runs. */
async function requireSales(ctx: ToolContext, perm: "view_sales" | "manage_sales"): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("has_permission", { uid: ctx.userId, perm });
  if (error) {
    console.error("mcp sales permission check failed:", error.message);
    throw new ToolError("Could not check your Sales access. Try again.");
  }
  if (data !== true) throw new ToolError(perm === "view_sales" ? NO_VIEW_SALES : NO_MANAGE_SALES);
}

type SalesPerson = { id: string; name: string | null; avatar_url: string | null; assignable: boolean | null };

async function salesPeople(ctx: ToolContext): Promise<SalesPerson[]> {
  const { data, error } = await ctx.supabase.rpc("sales_people");
  check(error, "Sales people");
  return (data ?? []) as SalesPerson[];
}

const peopleMap = (people: SalesPerson[]) => new Map<string, StepPerson>(people.map((p) => [p.id, p]));

export type PersonCandidate = { id: string; name: string | null; assignable?: boolean | null };

const listNames = (people: PersonCandidate[]) => people.slice(0, 8).map((p) => p.name ?? p.id).join(", ");

/** Resolves "me" / a user id / a Sales person's name to a user id. Names match only exactly
 * (case-insensitive) on the full name or the first name -- never a silent partial match; an
 * ambiguous or unknown name is an error listing the candidates.
 * assignableOnly (assignee, done_by, owner): only people who may hold Sales work count, and
 * "me"/an id must be one of them too -- the same set as the app's owner/assignee pickers. */
export function resolvePersonRef(
  ref: string,
  me: string,
  people: PersonCandidate[],
  { assignableOnly = true }: { assignableOnly?: boolean } = {}
): string {
  const value = ref.trim();
  const pool = assignableOnly ? people.filter((p) => p.assignable === true) : people;
  const lower = value.toLowerCase();
  const byId = lower === "me" ? me : z.uuid().safeParse(value).success ? value : null;
  if (byId) {
    if (assignableOnly && !pool.some((p) => p.id === byId)) {
      throw new ToolError(`${lower === "me" ? "You don't" : "That person doesn't"} have Sales access, so can't be assigned Sales work.`);
    }
    return byId;
  }
  const full = pool.filter((p) => (p.name ?? "").trim().toLowerCase() === lower);
  const first = full.length ? full : pool.filter((p) => (p.name ?? "").trim().split(/\s+/)[0]?.toLowerCase() === lower);
  if (first.length === 1) return first[0].id;
  if (first.length > 1) {
    throw new ToolError(`"${value}" matches several people: ${listNames(first)}. Use the full name or the user id.`);
  }
  const similar = pool.filter((p) => (p.name ?? "").toLowerCase().includes(lower));
  throw new ToolError(
    `No ${assignableOnly ? "assignable " : ""}Sales person is named "${value}". ` +
      (similar.length ? `Did you mean: ${listNames(similar)}?` : `Candidates: ${listNames(pool) || "none"}.`) +
      ' Use "me", a user id, or the full name.'
  );
}

type Resolved = { id: string; name: string | null };

/** resolvePersonRef against sales_people() (fetched once per call via `cache`), with the name. */
async function resolvePerson(ctx: ToolContext, ref: string, cache: { people?: SalesPerson[] }): Promise<Resolved> {
  cache.people ??= await salesPeople(ctx);
  const id = resolvePersonRef(ref, ctx.userId, cache.people);
  return { id, name: cache.people.find((p) => p.id === id)?.name ?? null };
}

/** The name for a user id from sales_people() (fetched once per call via `cache`). */
async function personName(ctx: ToolContext, id: string | null, cache: { people?: SalesPerson[] }): Promise<string | null> {
  if (!id) return null;
  cache.people ??= await salesPeople(ctx);
  return cache.people.find((p) => p.id === id)?.name ?? null;
}

/** Decides the lost_reason write for update_deal. A reason belongs only to a lost deal:
 * - moving to any other stage clears it (passing one is rejected rather than silently dropped);
 * - moving to lost requires one;
 * - a reason alone may only be changed on a deal that is already lost (and not blanked).
 * Returns the value to write, or undefined to leave the column alone. */
export function lostReasonFor(
  stage: (typeof DEAL_STAGES)[number] | undefined,
  lostReason: string | undefined,
  currentStage: (typeof DEAL_STAGES)[number] | null
): string | null | undefined {
  const reason = lostReason?.trim() ? lostReason.trim() : null;
  if (stage !== undefined && stage !== "lost") {
    if (reason) throw new ToolError(`lost_reason only applies to a lost deal. Leave it out when moving the deal to ${stage}.`);
    return null;
  }
  if (stage === "lost" || (lostReason !== undefined && currentStage === "lost")) {
    if (!reason) throw new ToolError("A lost deal needs a reason. Ask the user why it was lost and pass it as lost_reason.");
    return reason;
  }
  if (lostReason !== undefined) {
    throw new ToolError("This deal isn't lost, so it has no lost reason. To mark it lost, pass stage \"lost\" with lost_reason.");
  }
  return undefined;
}

/** Marks the Sales list and the company page for revalidation after a successful write (route
 * handler semantics: refreshed on the next visit). A failure here never fails the write. */
function revalidate(clientId: string | null | undefined, opts?: { clients?: boolean }): void {
  try {
    revalidateSales(clientId, opts);
  } catch (err) {
    console.error("mcp sales revalidate failed:", err instanceof Error ? err.message : err);
  }
}

const companyUrl = (clientId: string, dealId?: string | null) =>
  appUrl(`/sales/companies/${clientId}${dealId ? `?deal=${dealId}` : ""}`);

const stepOut = (s: NextStep, today = new Date()) =>
  compact({
    activity_id: s.activity_id,
    due: fmtDate(s.due_on),
    overdue_days: (() => {
      const d = daysUntil(s.due_on, today);
      return d !== null && d < 0 ? -d : null;
    })(),
    kind: s.kind,
    body: s.body,
    responsible: s.assignee?.name,
    responsible_id: s.assignee?.id,
  });

/** The client a crm_activities row belongs to (null when not visible). */
async function activityClient(ctx: ToolContext, activityId: string): Promise<string | null> {
  const { data, error } = await ctx.supabase.from("crm_activities").select("client_id").eq("id", activityId).maybeSingle();
  check(error, "the step");
  return data?.client_id ?? null;
}

// ---------------------------------------------------------------------------------------------
// Reads

const salesOverview = defineTool({
  name: "sales_overview",
  title: "Sales overview",
  description:
    "Companies in Sales (as the Sales list): open deals, open offer value and each company's earliest open next step. Filters: search (company/reg code/contact/step text), responsible for the next step (\"me\", \"nobody\", a user id or a name), next-step due date range. Earliest step first.",
  inputSchema: z.object({
    search: z.string().trim().min(1).max(100).optional(),
    responsible: personRef.optional().describe('"me", "nobody", a user id or a Sales person\'s name'),
    due_from: dateKey.optional().describe("Next step due on or after (YYYY-MM-DD)"),
    due_to: dateKey.optional().describe("Next step due on or before (YYYY-MM-DD)"),
  }),
  readOnly: true,
  handler: async ({ search, responsible, due_from, due_to }, ctx) => {
    await requireSales(ctx, "view_sales");
    const people = await salesPeople(ctx);
    const responsibleId =
      responsible === undefined ? null : responsible.trim().toLowerCase() === "nobody" ? ("nobody" as const) : resolvePersonRef(responsible, ctx.userId, people, { assignableOnly: false });
    let rows;
    try {
      rows = await fetchCompanyRows(ctx.supabase, peopleMap(people));
    } catch (err) {
      console.error("mcp sales_overview failed:", err instanceof Error ? err.message : err);
      throw new ToolError("Could not load Sales companies. Try again.");
    }
    const query = search?.trim().toLowerCase() ?? "";
    const filter = { from: due_from ?? null, to: due_to ?? null, responsible: responsibleId };
    const today = new Date();
    const filtered = rows.filter((r) => matchesStepFilter(r.next_step, filter) && (!query || matchesCompanyQuery(r, query)));
    const out = filtered.map((r) =>
      compact({
        id: r.id,
        name: r.name,
        reg_code: r.reg_code,
        kind: r.kind,
        open_deals: r.open_deals.length
          ? r.open_deals.map((d) => compact({ id: d.id, title: d.title, stage: d.stage, offer: d.offer }))
          : null,
        open_value: r.open_value || null,
        next_step: r.next_step ? stepOut(r.next_step, today) : null,
        url: companyUrl(r.id),
      })
    );
    return toText({ currency: "EUR", ...listResult("companies", out) });
  },
});

const getCompany = defineTool({
  name: "get_company",
  title: "Get company (Sales)",
  description:
    "A Sales company: details, contacts, deals with their offers, open next steps and the latest 50 history entries (logged activity, completed/cancelled steps and system entries).",
  inputSchema: z.object({ company_id: uuid("company_id") }),
  readOnly: true,
  handler: async ({ company_id }, ctx) => {
    await requireSales(ctx, "view_sales");
    const { supabase } = ctx;
    const [clientRes, kindRes, contactsRes, dealsRes, historyRes, stepsRes, people] = await Promise.all([
      supabase.from("clients").select("id, name, reg_code, phone, email, website, notes").eq("id", company_id).maybeSingle(),
      supabase.rpc("company_kind", { company: company_id }),
      supabase
        .from("client_contacts")
        .select("id, name, role, email, phone, is_primary, description")
        .eq("client_id", company_id)
        .order("is_primary", { ascending: false })
        .order("name"),
      supabase
        .from("deals")
        .select("id, title, stage, source, owner_id, lost_reason, project_id, offers(id, title, amount, status, sent_on, valid_until, link_url, note, created_at)")
        .eq("client_id", company_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("crm_activities")
        .select("id, kind, body, occurred_at, deal_id, contact_id, actor_id, status, done_at, done_by, done_comment, cancelled_at, cancel_reason")
        .eq("client_id", company_id)
        .in("status", ["done", "cancelled"])
        .order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("crm_activities")
        .select("id, kind, body, due_on, deal_id, contact_id, assignee_id, deals(stage)")
        .eq("client_id", company_id)
        .eq("status", "planned")
        .order("due_on")
        .order("created_at")
        .order("id"),
      salesPeople(ctx),
    ]);
    check(clientRes.error ?? kindRes.error ?? contactsRes.error ?? dealsRes.error ?? historyRes.error ?? stepsRes.error, "the company");
    const c = clientRes.data;
    if (!c) notFound("Company");

    const names = peopleMap(people);
    const nameOf = (id: string | null) => (id ? (names.get(id)?.name ?? "Unknown") : null);
    const dealTitle = new Map((dealsRes.data ?? []).map((d) => [d.id, d.title]));
    const contactName = new Map((contactsRes.data ?? []).map((x) => [x.id, x.name]));
    const today = new Date();

    const steps = (stepsRes.data ?? [])
      .flatMap(({ deals: deal, ...s }) => {
        if (deal && CLOSED_STAGES.includes(deal.stage)) return [];
        const step = toNextStep({ ...s, activity_id: s.id }, names);
        return step ? [step] : [];
      })
      .sort((a, b) => compareDueDates(a.due_on, b.due_on));

    const history = (historyRes.data ?? [])
      .sort((a, b) => Date.parse(timelineAt(b)) - Date.parse(timelineAt(a)))
      .slice(0, 50);

    return toText(
      compact({
        id: c.id,
        name: c.name,
        kind: kindRes.data === "prospect" ? "prospect" : "client",
        reg_code: c.reg_code,
        phone: c.phone,
        email: c.email,
        website: c.website,
        notes: c.notes,
        contacts: (contactsRes.data ?? []).slice(0, MAX_ROWS).map((x) =>
          compact({ id: x.id, name: x.name, role: x.role, email: x.email, phone: x.phone, primary: x.is_primary || null, description: x.description })
        ),
        deals: (dealsRes.data ?? []).slice(0, MAX_ROWS).map((d) =>
          compact({
            id: d.id,
            title: d.title,
            stage: d.stage,
            source: d.source,
            owner: nameOf(d.owner_id),
            owner_id: d.owner_id,
            lost_reason: d.lost_reason,
            project_url: d.project_id ? appUrl(`/projects/${d.project_id}`) : null,
            offers: offersNewestFirst((d.offers ?? []).map((o) => ({ ...o, amount: Number(o.amount) }))).map((o) =>
              compact({
                id: o.id,
                title: o.title,
                amount: o.amount,
                status: o.status,
                sent: fmtDate(o.sent_on),
                valid_until: fmtDate(o.valid_until),
                link: o.link_url,
                note: o.note,
              })
            ),
            url: companyUrl(c.id, d.id),
          })
        ),
        next_steps: steps.slice(0, MAX_ROWS).map((s) =>
          compact({
            ...stepOut(s, today),
            deal: s.deal_id ? dealTitle.get(s.deal_id) : null,
            deal_id: s.deal_id,
            contact: s.contact_id ? contactName.get(s.contact_id) : null,
            contact_id: s.contact_id,
          })
        ),
        history: history.map((a) =>
          compact({
            id: a.id,
            date: fmtDate(timelineAt(a)),
            kind: a.kind,
            status: a.kind === "system" ? null : a.status,
            body: a.body,
            by: nameOf(a.status === "done" && a.done_by ? a.done_by : a.actor_id),
            done_comment: a.done_comment,
            cancel_reason: a.cancel_reason,
            deal: a.deal_id ? dealTitle.get(a.deal_id) : null,
            contact: a.contact_id ? contactName.get(a.contact_id) : null,
          })
        ),
        history_note: (historyRes.data ?? []).length > 50 ? "Showing the latest 50 history entries; open the app for the rest." : null,
        currency: "EUR",
        url: companyUrl(c.id),
      })
    );
  },
});

const myNextSteps = defineTool({
  name: "my_next_steps",
  title: "My next steps",
  description: "Your open Sales next steps (assigned to you), earliest due first, with overdue days and the company.",
  inputSchema: z.object({}),
  readOnly: true,
  handler: async (_input, ctx) => {
    await requireSales(ctx, "view_sales");
    const { data, error } = await ctx.supabase
      .from("crm_activities")
      .select("id, client_id, kind, body, due_on, deal_id, contact_id, assignee_id, clients(name), deals(title, stage)")
      .eq("status", "planned")
      .eq("assignee_id", ctx.userId)
      .order("due_on")
      .order("created_at")
      .limit(500);
    check(error, "your next steps");
    const today = new Date();
    const me = new Map<string, StepPerson>([[ctx.userId, { name: "me", avatar_url: null }]]);
    const rows = (data ?? []).flatMap(({ deals: deal, clients: client, ...s }) => {
      if (deal && CLOSED_STAGES.includes(deal.stage)) return [];
      const step = toNextStep({ ...s, activity_id: s.id }, me);
      if (!step) return [];
      const { activity_id, due, overdue_days, kind: k, body } = stepOut(step, today);
      return [compact({ activity_id, due, overdue_days, kind: k, body, company: client?.name, company_id: s.client_id, deal: deal?.title, deal_id: s.deal_id, url: companyUrl(s.client_id, s.deal_id) })];
    });
    return toText(listResult("steps", rows));
  },
});

// ---------------------------------------------------------------------------------------------
// Writes

const logActivity = defineTool({
  name: "log_activity",
  title: "Log activity",
  description: `${WRITE_NOTE} Logs something that already happened (call, email, meeting, note) in a company's Sales history.`,
  inputSchema: z.object({
    company_id: uuid("company_id"),
    kind,
    body: z.string().trim().min(1).max(5000),
    occurred_at: z.string().optional().describe("When it happened, ISO date-time with offset; default now"),
    deal_id: uuid("deal_id").optional(),
    contact_id: uuid("contact_id").optional(),
  }),
  readOnly: false,
  handler: async (input, ctx) => {
    await requireSales(ctx, "manage_sales");
    const { client_id, deal_id, contact_id, kind: k, body, occurred_at } = parseWith(activitySchema, {
      client_id: input.company_id,
      deal_id: input.deal_id ?? null,
      contact_id: input.contact_id ?? null,
      kind: input.kind,
      body: input.body,
      occurred_at: input.occurred_at,
    });
    const refError = await assertStepRefsBelongToClient(ctx.supabase, client_id, deal_id, contact_id);
    if (refError) throw new ToolError(refError);
    const { data, error } = await ctx.supabase
      .from("crm_activities")
      .insert({ client_id, deal_id: deal_id ?? null, contact_id: contact_id ?? null, kind: k, body, occurred_at })
      .select("id, occurred_at")
      .single();
    if (error || !data) {
      if (error) console.error("mcp log_activity failed:", error.code, error.message);
      throw new ToolError("Save failed. Try again.");
    }
    await ctx.audit({ action: "company.saved", resourceType: "crm_activity", resourceId: data.id, metadata: { client_id, deal_id, kind: k } });
    revalidate(client_id);
    return toText({ result: "Activity logged", activity_id: data.id, date: fmtDate(data.occurred_at), url: companyUrl(client_id) });
  },
});

const planStep = defineTool({
  name: "plan_step",
  title: "Plan next step",
  description: `${WRITE_NOTE} Plans a next step for a company (what, when, who). Assignee defaults to you.`,
  inputSchema: z.object({
    company_id: uuid("company_id"),
    kind,
    body: z.string().trim().min(1).max(2000),
    due_on: dateKey,
    assignee: personRef.optional(),
    deal_id: uuid("deal_id").optional(),
    contact_id: uuid("contact_id").optional(),
  }),
  readOnly: false,
  handler: async (input, ctx) => {
    await requireSales(ctx, "manage_sales");
    const assignee = await resolvePerson(ctx, input.assignee ?? "me", {});
    const assignee_id = assignee.id;
    const { client_id, deal_id, contact_id, kind: k, body, due_on } = parseWith(planStepSchema, {
      client_id: input.company_id,
      deal_id: input.deal_id ?? null,
      contact_id: input.contact_id ?? null,
      kind: input.kind,
      body: input.body,
      due_on: input.due_on,
      assignee_id,
    });
    const refError = await assertStepRefsBelongToClient(ctx.supabase, client_id, deal_id, contact_id);
    if (refError) throw new ToolError(refError);
    // Never send actor_id: the DB default is auth.uid() and RLS pins it.
    const { data, error } = await ctx.supabase
      .from("crm_activities")
      .insert({ client_id, deal_id: deal_id ?? null, contact_id: contact_id ?? null, kind: k, body, status: "planned", due_on, assignee_id })
      .select("id")
      .single();
    if (error || !data) throw new ToolError(mapPlanStepInsertError(error));
    await ctx.audit({
      action: "company.saved",
      resourceType: "crm_activity",
      resourceId: data.id,
      metadata: { client_id, deal_id, kind: k, status: "planned" },
    });
    revalidate(client_id);
    return toText(
      compact({ result: "Next step planned", activity_id: data.id, due: fmtDate(due_on), assignee: assignee.name, assignee_id, url: companyUrl(client_id) })
    );
  },
});

const completeStep = defineTool({
  name: "complete_step",
  title: "Mark step done",
  description: `${WRITE_NOTE} Marks a planned next step as done, with an optional comment. done_on defaults to today (not in the future); done_by defaults to you.`,
  inputSchema: z.object({
    activity_id: uuid("activity_id"),
    comment: optText(2000),
    done_on: dateKey.optional(),
    done_by: personRef.optional(),
  }),
  readOnly: false,
  handler: async (input, ctx) => {
    await requireSales(ctx, "manage_sales");
    const doneBy = await resolvePerson(ctx, input.done_by ?? "me", {});
    const done_by_id = doneBy.id;
    const { activity_id, done_on, done_by, comment } = parseWith(completeStepSchema, {
      activity_id: input.activity_id,
      done_on: input.done_on ?? appDayKey(new Date()),
      done_by: done_by_id,
      comment: input.comment,
    });
    const clientId = await activityClient(ctx, activity_id);
    if (!clientId) notFound("Step");
    const { error } = await ctx.supabase.rpc("complete_activity", {
      p_id: activity_id,
      p_done_on: done_on,
      p_done_by: done_by,
      // Non-nullable in the generated Args; the SQL side treats "" as null.
      p_comment: comment ?? "",
    });
    if (error) throw new ToolError(mapStepRpcError(error, "Pick a valid date (not in the future)."));
    await ctx.audit({ action: "company.saved", resourceType: "crm_activity", resourceId: activity_id, metadata: { client_id: clientId, status: "done" } });
    revalidate(clientId);
    return toText(compact({ result: "Step marked done", activity_id, done_on: fmtDate(done_on), done_by: doneBy.name, url: companyUrl(clientId) }));
  },
});

const updateStep = defineTool({
  name: "update_step",
  title: "Update next step",
  description: `${WRITE_NOTE} Changes a planned next step: text, kind, due date (reschedule), assignee (reassign), linked contact or deal (null clears the link). Only the fields you pass change.`,
  inputSchema: z.object({
    activity_id: uuid("activity_id"),
    body: z.string().trim().min(1).max(2000).optional(),
    kind: kind.optional(),
    due_on: dateKey.optional(),
    assignee: personRef.optional(),
    contact_id: uuid("contact_id").nullable().optional(),
    deal_id: uuid("deal_id").nullable().optional(),
  }),
  readOnly: false,
  handler: async (input, ctx) => {
    await requireSales(ctx, "manage_sales");
    const { activity_id, assignee, ...rest } = input;
    if (assignee === undefined && Object.values(rest).every((v) => v === undefined)) {
      throw new ToolError("Nothing to change. Pass at least one of body, kind, due_on, assignee, contact_id, deal_id.");
    }
    const { data: cur, error: curError } = await ctx.supabase
      .from("crm_activities")
      .select("client_id, status, kind, body, due_on, assignee_id, contact_id, deal_id")
      .eq("id", activity_id)
      .maybeSingle();
    check(curError, "the step");
    if (!cur) notFound("Step");
    if (cur.status !== "planned") throw new ToolError("This step is already done or was removed.");

    const cache: { people?: SalesPerson[] } = {};
    const newAssignee = assignee ? await resolvePerson(ctx, assignee, cache) : null;
    const merged = {
      activity_id,
      kind: rest.kind ?? cur.kind,
      body: rest.body ?? cur.body,
      due_on: rest.due_on ?? cur.due_on,
      assignee_id: newAssignee ? newAssignee.id : cur.assignee_id,
      contact_id: rest.contact_id === undefined ? cur.contact_id : rest.contact_id,
      deal_id: rest.deal_id === undefined ? cur.deal_id : rest.deal_id,
    };
    const p = parseWith(updateStepSchema, merged);
    const { error } = await ctx.supabase.rpc("update_step", {
      p_id: p.activity_id,
      p_body: p.body,
      p_kind: p.kind,
      p_due_on: p.due_on,
      p_assignee: p.assignee_id,
      // Null clears the link on the SQL side; the generated Args type says non-null.
      p_contact: p.contact_id as never,
      p_deal: p.deal_id as never,
    });
    if (error) throw new ToolError(mapRound3RpcError(error, "This step is already done or was removed."));
    const changed = Object.keys(input).filter((k) => k !== "activity_id" && input[k as keyof typeof input] !== undefined);
    await ctx.audit({ action: "company.saved", resourceType: "crm_activity", resourceId: activity_id, metadata: { client_id: cur.client_id, status: "planned", changed } });
    revalidate(cur.client_id);
    return toText(
      compact({
        result: "Next step updated",
        activity_id,
        changed,
        due: fmtDate(p.due_on),
        assignee: newAssignee ? newAssignee.name : await personName(ctx, p.assignee_id, cache),
        assignee_id: p.assignee_id,
        url: companyUrl(cur.client_id),
      })
    );
  },
});

const cancelStep = defineTool({
  name: "cancel_step",
  title: "Cancel next step",
  description: `${WRITE_NOTE} Cancels a planned next step (it stays in the history as cancelled), with an optional reason.`,
  inputSchema: z.object({ activity_id: uuid("activity_id"), reason: optText(500) }),
  readOnly: false,
  handler: async (input, ctx) => {
    await requireSales(ctx, "manage_sales");
    const { activity_id, reason } = parseWith(cancelStepSchema, input);
    const clientId = await activityClient(ctx, activity_id);
    if (!clientId) notFound("Step");
    // Non-nullable in the generated Args; the SQL side coalesces a blank reason.
    const { error } = await ctx.supabase.rpc("cancel_step", { p_id: activity_id, p_reason: reason ?? "" });
    if (error) throw new ToolError(mapRound3RpcError(error, "This step is already done or was removed."));
    await ctx.audit({ action: "company.saved", resourceType: "crm_activity", resourceId: activity_id, metadata: { client_id: clientId, status: "cancelled" } });
    revalidate(clientId);
    return toText({ result: "Next step cancelled", activity_id, url: companyUrl(clientId) });
  },
});

const moveEntryToSteps = defineTool({
  name: "move_entry_to_steps",
  title: "Move entry to next steps",
  description: `${WRITE_NOTE} Turns a logged history entry (saved as already happened by mistake) into a planned next step with a due date and assignee (default you).`,
  inputSchema: z.object({ activity_id: uuid("activity_id"), due_on: dateKey, assignee: personRef.optional() }),
  readOnly: false,
  handler: async (input, ctx) => {
    await requireSales(ctx, "manage_sales");
    const assignee = await resolvePerson(ctx, input.assignee ?? "me", {});
    const { activity_id, due_on, assignee_id } = parseWith(convertEntrySchema, {
      activity_id: input.activity_id,
      due_on: input.due_on,
      assignee_id: assignee.id,
    });
    const clientId = await activityClient(ctx, activity_id);
    if (!clientId) notFound("Entry");
    const { error } = await ctx.supabase.rpc("convert_entry_to_step", { p_id: activity_id, p_due_on: due_on, p_assignee: assignee_id });
    if (error) throw new ToolError(mapConvertEntryError(error));
    await ctx.audit({
      action: "company.saved",
      resourceType: "crm_activity",
      resourceId: activity_id,
      metadata: { client_id: clientId, moved_to_next_steps: true, due_on, assignee_id },
    });
    revalidate(clientId);
    return toText(
      compact({ result: "Entry moved to next steps", activity_id, due: fmtDate(due_on), assignee: assignee.name, assignee_id, url: companyUrl(clientId) })
    );
  },
});

const createLead = defineTool({
  name: "create_lead",
  title: "Create lead",
  description: `${WRITE_NOTE} Creates a deal for an existing company (company_id) or a new company (company.name), optionally with a first contact and a first next step. Deal owner defaults to you; the step's assignee defaults to the owner.`,
  inputSchema: z.object({
    company_id: uuid("company_id").optional(),
    company: z
      .object({
        name: z.string().trim().min(1).max(200),
        reg_code: optText(40),
        phone: optText(60),
        email: optText(320),
        website: optText(2000).describe("http(s) URL"),
        notes: optText(5000),
      })
      .optional()
      .describe("New company -- only when company_id is not given"),
    deal: z.object({
      title: z.string().trim().min(1).max(200),
      source: z.enum(DEAL_SOURCES),
      owner: personRef.optional(),
    }),
    contact: z
      .object({
        first_name: z.string().trim().min(1).max(100),
        last_name: optText(100),
        email: optText(320),
        phone: optText(60),
        role: optText(120),
      })
      .optional(),
    step: z
      .object({ body: z.string().trim().min(1).max(2000), due_on: dateKey, kind: kind.optional(), assignee: personRef.optional() })
      .optional(),
  }),
  readOnly: false,
  handler: async (input, ctx) => {
    await requireSales(ctx, "manage_sales");
    if (!input.company_id && !input.company) throw new ToolError("Pass company_id for an existing company, or company.name for a new one.");
    const cache: { people?: SalesPerson[] } = {};
    const owner = await resolvePerson(ctx, input.deal.owner ?? "me", cache);
    const owner_id = owner.id;
    // Unset step assignee -> prepareLeadInput defaults it to the deal owner (as in the app).
    const stepAssignee = input.step?.assignee ? await resolvePerson(ctx, input.step.assignee, cache) : null;
    const raw: NewLeadInput = prepareLeadInput({
      client_id: input.company_id ?? null,
      company: input.company,
      deal: { title: input.deal.title, source: input.deal.source, owner_id },
      contact: input.contact,
      step: input.step ? { body: input.step.body, due_on: input.step.due_on, kind: input.step.kind ?? null, assignee_id: stepAssignee?.id ?? null } : undefined,
    });
    const { client_id, company, deal, contact, step } = parseWith(newLeadSchema, raw);

    if (!client_id) {
      const dup = await existingByRegCode(ctx.supabase, company?.reg_code ?? null);
      if (dup) {
        throw new ToolError(`A company with this registry code already exists: ${dup.name} (id ${dup.id}). Use company_id to add the deal to it.`);
      }
    }
    const { data, error } = await ctx.supabase.rpc("create_lead", {
      // The SQL function accepts a null p_client_id (new company path).
      p_client_id: client_id as never,
      p_company: (company ?? {}) as never,
      p_deal: deal as never,
      p_contact: (contact?.first_name ? contact : null) as never,
      p_step: (step?.body ? step : null) as never,
    });
    if (error) throw new ToolError(mapCreateLeadError(error));
    const { client_id: clientId, deal_id: dealId } = data as { client_id: string; deal_id: string };
    await ctx.audit({ action: "deal.created", resourceType: "deal", resourceId: dealId, metadata: { client_id: clientId } });
    revalidate(clientId, { clients: true });
    const leadStep = step?.body ? step : null;
    return toText(
      compact({
        result: "Lead created",
        company_id: clientId,
        deal_id: dealId,
        owner: owner.name,
        owner_id,
        step: leadStep
          ? compact({ due: fmtDate(leadStep.due_on), assignee: await personName(ctx, leadStep.assignee_id, cache), assignee_id: leadStep.assignee_id })
          : null,
        url: companyUrl(clientId, dealId),
      })
    );
  },
});

const updateDeal = defineTool({
  name: "update_deal",
  title: "Update deal",
  description: `${WRITE_NOTE} Changes a deal's stage, title, source or owner. Moving to "lost" requires lost_reason; moving to any other stage clears it; lost_reason alone can only be changed on a deal that is already lost. Only the fields you pass change.`,
  inputSchema: z.object({
    deal_id: uuid("deal_id"),
    stage: z.enum(DEAL_STAGES).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    source: z.enum(DEAL_SOURCES).optional(),
    owner: personRef.optional(),
    lost_reason: optText(500),
  }),
  readOnly: false,
  handler: async (input, ctx) => {
    await requireSales(ctx, "manage_sales");
    const raw: Record<string, unknown> = {};
    if (input.stage !== undefined) raw.stage = input.stage;
    if (input.title !== undefined) raw.title = input.title;
    if (input.source !== undefined) raw.source = input.source;
    if (input.owner !== undefined) raw.owner_id = (await resolvePerson(ctx, input.owner, {})).id;
    if (!Object.keys(raw).length && input.lost_reason === undefined) {
      throw new ToolError("Nothing to change. Pass at least one of stage, title, source, owner, lost_reason.");
    }
    // A reason alone is only valid on a deal that is already lost -- look its stage up then.
    let currentStage: (typeof DEAL_STAGES)[number] | null = null;
    if (input.stage === undefined && input.lost_reason !== undefined) {
      const { data: cur, error: curError } = await ctx.supabase.from("deals").select("stage").eq("id", input.deal_id).maybeSingle();
      check(curError, "the deal");
      if (!cur) notFound("Deal");
      currentStage = cur.stage;
    }
    const lostReason = lostReasonFor(input.stage, input.lost_reason, currentStage);
    if (lostReason !== undefined) raw.lost_reason = lostReason;
    const parsed = parseWith(dealUpdateSchema, raw);
    // Only the keys actually sent -- the schema turns an absent lost_reason into null.
    const payload = pickProvided(parsed, raw);
    const { data, error } = await ctx.supabase
      .from("deals")
      .update(payload)
      .eq("id", input.deal_id)
      .select("client_id, title, stage")
      .maybeSingle();
    if (error) {
      if (error.code !== "23514") console.error("mcp update_deal failed:", error.code, error.message);
      throw new ToolError(mapDealUpdateError(error));
    }
    if (!data) notFound("Deal");
    await ctx.audit({ action: "deal.updated", resourceType: "deal", resourceId: input.deal_id, metadata: { client_id: data.client_id, changed: Object.keys(raw) } });
    revalidate(data.client_id);
    return toText({
      result: "Deal updated",
      deal_id: input.deal_id,
      title: data.title,
      stage: data.stage,
      changed: Object.keys(raw),
      url: companyUrl(data.client_id, input.deal_id),
    });
  },
});

const saveOffer = defineTool({
  name: "save_offer",
  title: "Save offer",
  description: `${WRITE_NOTE} Adds an offer to a deal, or updates one (pass offer_id; only the fields you pass change). Amount in EUR.`,
  inputSchema: z.object({
    deal_id: uuid("deal_id"),
    offer_id: uuid("offer_id").optional(),
    title: z.string().trim().min(1).max(200).optional().describe("Required for a new offer"),
    amount: z.number().min(0).max(99_999_999).optional().describe("Required for a new offer"),
    status: z.enum(OFFER_STATUSES).optional().describe("Default draft for a new offer"),
    sent_on: dateKey.nullable().optional(),
    valid_until: dateKey.nullable().optional(),
    link_url: nullableText(2000).describe("http(s) URL"),
    note: nullableText(2000),
  }),
  readOnly: false,
  handler: async (input, ctx) => {
    await requireSales(ctx, "manage_sales");
    const { deal_id, offer_id, ...fields } = input;
    let base: Record<string, unknown> = { status: "draft" };
    if (!offer_id) {
      if (fields.title === undefined) throw new ToolError("Title is required for a new offer.");
      if (fields.amount === undefined) throw new ToolError("Amount is required for a new offer.");
    }
    if (offer_id) {
      const { data: cur, error } = await ctx.supabase
        .from("offers")
        .select("title, amount, status, sent_on, valid_until, link_url, note")
        .eq("id", offer_id)
        .eq("deal_id", deal_id)
        .maybeSingle();
      check(error, "the offer");
      if (!cur) notFound("Offer on that deal");
      base = { ...cur, amount: Number(cur.amount) };
    }
    const provided = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const values = parseWith(offerSchema, { ...base, ...provided });
    // Scoped to this deal too, so an offer_id of another deal is never rewritten under this one.
    const write = offer_id
      ? ctx.supabase.from("offers").update(values).eq("id", offer_id).eq("deal_id", deal_id)
      : ctx.supabase.from("offers").insert({ ...values, deal_id });
    const { data, error } = await write.select("id, deal_id").maybeSingle();
    if (error || !data) {
      // 23503: the deal id doesn't exist (or isn't visible).
      if (!error || error.code === "23503") notFound("Deal");
      console.error("mcp save_offer failed:", error.code, error.message);
      throw new ToolError("Save failed. Try again.");
    }
    const { data: deal } = await ctx.supabase.from("deals").select("client_id").eq("id", data.deal_id).maybeSingle();
    await ctx.audit({ action: "offer.saved", resourceType: "offer", resourceId: data.id, metadata: { deal_id: data.deal_id } });
    revalidate(deal?.client_id);
    return toText(
      compact({
        result: offer_id ? "Offer updated" : "Offer added",
        offer_id: data.id,
        title: values.title,
        amount: values.amount,
        status: values.status,
        url: deal ? companyUrl(deal.client_id, data.deal_id) : null,
      })
    );
  },
});

export const SALES_READ_TOOLS: ToolDef[] = [salesOverview, getCompany, myNextSteps];
export const SALES_WRITE_TOOLS: ToolDef[] = [
  logActivity,
  planStep,
  completeStep,
  updateStep,
  cancelStep,
  moveEntryToSteps,
  createLead,
  updateDeal,
  saveOffer,
];
export const SALES_TOOLS: ToolDef[] = [...SALES_READ_TOOLS, ...SALES_WRITE_TOOLS];
