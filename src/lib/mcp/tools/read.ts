// Read-only MCP tools. Every query goes through ctx.supabase -- the USER-SCOPED client -- so RLS
// decides what comes back exactly as in the app: rows the user can't see are absent, finance
// columns the user can't see come back null and are dropped from the output (never shown as 0).
// Queries mirror the app pages they correspond to (projects list/detail, clients, people,
// workload, budget, global search). Outputs are compact JSON, lists capped at MAX_ROWS.
import { z } from "zod";
import { escapeIlike } from "@/lib/search";
import { deriveProgress } from "@/lib/progress";
import { appDayKey, shiftDayKey } from "@/lib/time-zone";
import { weekStartsFrom } from "@/lib/workload";
import { visibleProjectTags } from "@/lib/project-icons";
import { MAX_ROWS, appUrl, compact, fmtDate, listResult, round1, toText } from "@/lib/mcp/format";
import { defineTool, ToolError, type ToolContext, type ToolDef } from "@/lib/mcp/types";

const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const;

const uuid = (what: string) => z.uuid({ message: `${what} must be an id (uuid) -- use search or a list tool to find it` });
const text = (max = 100) => z.string().trim().min(1).max(max);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Throws a friendly ToolError for a DB error; the raw message only goes to the server log. */
function check(error: { message: string } | null, what: string): void {
  if (error) {
    console.error(`mcp read ${what} failed:`, error.message);
    throw new ToolError(`Could not load ${what}. Try again.`);
  }
}

function notFound(what: string): never {
  throw new ToolError(`${what} not found, or you don't have access to it.`);
}

async function peopleNamesByUserId(ctx: ToolContext, userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((v): v is string => !!v))];
  if (!ids.length) return new Map<string, { id: string; full_name: string }>();
  const { data, error } = await ctx.supabase.from("people").select("id, user_id, full_name").in("user_id", ids);
  check(error, "people");
  return new Map((data ?? []).map((p) => [p.user_id as string, { id: p.id, full_name: p.full_name }]));
}

async function namesById(
  ctx: ToolContext,
  table: "projects" | "project_parts",
  ids: (string | null)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (!unique.length) return new Map();
  const { data, error } = await ctx.supabase.from(table).select("id, name").in("id", unique);
  check(error, table === "projects" ? "projects" : "project parts");
  return new Map((data ?? []).map((r) => [r.id, r.name]));
}

// ---------------------------------------------------------------------------------------------

const whoami = defineTool({
  name: "whoami",
  title: "Who am I",
  description: "Shows which user this connection acts as: name, email, roles, linked person record, key expiry and main capabilities.",
  inputSchema: z.object({}),
  readOnly: true,
  handler: async (_input, ctx) => {
    const { supabase, userId, keyId } = ctx;
    const perms = ["view_sales", "manage_sales", "view_budget", "create_project", "log_time"] as const;
    const [profileRes, rolesRes, personRes, keyRes, ...permRes] = await Promise.all([
      supabase.from("user_profiles").select("full_name, email, status").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role_key").eq("user_id", userId),
      supabase.from("people").select("id, full_name, role_title").eq("user_id", userId).maybeSingle(),
      supabase.from("mcp_keys").select("label, key_prefix, expires_at").eq("id", keyId).maybeSingle(),
      ...perms.map((perm) => supabase.rpc("has_permission", { uid: userId, perm })),
    ]);
    check(profileRes.error, "your profile");
    if (!profileRes.data) notFound("Your profile");
    check(rolesRes.error ?? personRes.error ?? keyRes.error ?? permRes.find((r) => r.error)?.error ?? null, "your account details");
    const capabilities = Object.fromEntries(perms.map((p, i) => [p, permRes[i].data === true]));
    return toText(
      compact({
        name: profileRes.data.full_name,
        email: profileRes.data.email,
        roles: (rolesRes.data ?? []).map((r) => r.role_key),
        person: personRes.data
          ? compact({ id: personRes.data.id, name: personRes.data.full_name, role: personRes.data.role_title, url: appUrl(`/people/${personRes.data.id}`) })
          : null,
        key: keyRes.data
          ? { label: keyRes.data.label, prefix: keyRes.data.key_prefix, expires: fmtDate(keyRes.data.expires_at) }
          : null,
        capabilities,
        today: fmtDate(appDayKey(new Date())),
        app: appUrl("/dashboard"),
      })
    );
  },
});

const search = defineTool({
  name: "search",
  title: "Search",
  description: "Search projects, clients (by name or contact name) and people by name. Returns ids and app links.",
  inputSchema: z.object({ query: z.string().trim().min(2, "At least 2 characters").max(100) }),
  readOnly: true,
  handler: async ({ query }, { supabase }) => {
    const pattern = `%${escapeIlike(query)}%`;
    const LIMIT = 10;
    const [projects, clients, people, contacts] = await Promise.all([
      supabase.from("projects").select("id, name, status").ilike("name", pattern).order("name").limit(LIMIT),
      supabase.from("clients").select("id, name").ilike("name", pattern).order("name").limit(LIMIT),
      supabase.from("people").select("id, full_name, role_title").ilike("full_name", pattern).order("full_name").limit(LIMIT),
      supabase.from("client_contacts").select("name, clients(id, name)").ilike("name", pattern).order("name").limit(LIMIT),
    ]);
    check(projects.error ?? clients.error ?? people.error ?? contacts.error, "search results");

    const clientRows: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (const c of clients.data ?? []) {
      seen.add(c.id);
      clientRows.push({ id: c.id, name: c.name, url: appUrl(`/clients/${c.id}`) });
    }
    for (const contact of contacts.data ?? []) {
      const client = contact.clients;
      if (!client || seen.has(client.id)) continue;
      seen.add(client.id);
      clientRows.push({ id: client.id, name: client.name, matched_contact: contact.name, url: appUrl(`/clients/${client.id}`) });
    }

    return toText({
      projects: (projects.data ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status, url: appUrl(`/projects/${p.id}`) })),
      clients: clientRows.slice(0, LIMIT),
      people: (people.data ?? []).map((p) => compact({ id: p.id, name: p.full_name, role: p.role_title, url: appUrl(`/people/${p.id}`) })),
    });
  },
});

const listProjects = defineTool({
  name: "list_projects",
  title: "List projects",
  description: "List projects you can see, newest activity first. Optional filters: status, project manager name, client name, project name text. Budget figures appear only if you may see them.",
  inputSchema: z.object({
    status: z.enum(PROJECT_STATUSES).optional(),
    pm: text().optional().describe("Project manager name (partial match)"),
    client: text().optional().describe("Client name (partial match)"),
    query: text().optional().describe("Project name (partial match)"),
  }),
  readOnly: true,
  handler: async ({ status, pm, client, query }, { supabase }) => {
    let q = supabase
      .from("project_list_rows")
      .select("id, name, status, client_name, pm_name, priority, start_date, deadline, budget_total, budget_used, updated_at", { count: "exact" });
    if (status) q = q.eq("status", status);
    if (pm) q = q.ilike("pm_name", `%${escapeIlike(pm)}%`);
    if (client) q = q.ilike("client_name", `%${escapeIlike(client)}%`);
    if (query) q = q.ilike("name", `%${escapeIlike(query)}%`);
    const { data, error, count } = await q.order("updated_at", { ascending: false }).range(0, MAX_ROWS - 1);
    check(error, "projects");
    const rows = (data ?? [])
      .filter((r) => r.id)
      .map((r) =>
        compact({
          id: r.id,
          name: r.name,
          status: r.status,
          client: r.client_name,
          pm: r.pm_name,
          priority: r.priority,
          start: fmtDate(r.start_date),
          deadline: fmtDate(r.deadline),
          budget_total: r.budget_total,
          budget_used: r.budget_used,
          url: appUrl(`/projects/${r.id}`),
        })
      );
    return toText(listResult("projects", rows, count));
  },
});

const getProject = defineTool({
  name: "get_project",
  title: "Get project",
  description: "Project details: status, dates, client, PM, description, notes, parts, team, milestones, the 5 latest status updates, derived progress and a budget summary (only if you may see budgets).",
  inputSchema: z.object({ project_id: uuid("project_id") }),
  readOnly: true,
  handler: async ({ project_id }, ctx) => {
    const { supabase } = ctx;
    const { data: p, error } = await supabase.from("projects").select("*").eq("id", project_id).maybeSingle();
    check(error, "project");
    if (!p) notFound("Project");

    const [parts, members, milestones, updates, budget, clientRes] = await Promise.all([
      supabase
        .from("project_parts")
        .select("id, name, status, estimated_hours, start_date, end_date, responsible_person_id")
        .eq("project_id", project_id)
        .order("start_date", { ascending: true, nullsFirst: false }),
      supabase.from("project_members").select("user_id, role_on_project").eq("project_id", project_id),
      supabase.from("project_milestones").select("name, kind, due_on, done").eq("project_id", project_id).order("due_on").order("sort"),
      supabase
        .from("project_status_updates")
        .select("author_id, created_at, completed, in_progress, blockers, next_milestone, decisions_needed")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("project_budget_rows").select("budget_type, client_amount, invoiced, paid, remaining, consumption_pct").eq("id", project_id).maybeSingle(),
      p.client_id ? supabase.from("clients").select("name").eq("id", p.client_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    check(parts.error ?? members.error ?? milestones.error ?? updates.error ?? budget.error ?? clientRes.error, "project details");

    const people = await peopleNamesByUserId(ctx, [
      p.pm_id,
      p.owner_id,
      ...(members.data ?? []).map((m) => m.user_id),
      ...(updates.data ?? []).map((u) => u.author_id),
    ]);
    const responsibleIds = [...new Set((parts.data ?? []).map((x) => x.responsible_person_id).filter((v): v is string => !!v))];
    const { data: responsible, error: responsibleError } = responsibleIds.length
      ? await supabase.from("people").select("id, full_name").in("id", responsibleIds)
      : { data: [] as { id: string; full_name: string }[], error: null };
    check(responsibleError, "project parts");
    const responsibleName = new Map((responsible ?? []).map((r) => [r.id, r.full_name]));

    const progress = deriveProgress((parts.data ?? []).map((x) => ({ status: x.status, estimated_hours: x.estimated_hours })));
    // Only when the viewer can actually see budget figures (RLS nulls them otherwise) -- a bare
    // budget_type alone is not a budget summary.
    const budgetVisible = !!budget.data && (budget.data.client_amount !== null || budget.data.remaining !== null);
    const budgetSummary = budgetVisible && budget.data
      ? compact({
          type: budget.data.budget_type,
          client_amount: budget.data.client_amount,
          invoiced: budget.data.invoiced,
          paid: budget.data.paid,
          remaining: budget.data.remaining,
          consumption_pct: round1(budget.data.consumption_pct),
        })
      : null;

    return toText(
      compact({
        id: p.id,
        name: p.name,
        status: p.status,
        priority: p.priority,
        client: clientRes.data?.name,
        pm: p.pm_id ? people.get(p.pm_id)?.full_name : null,
        owner: p.owner_id ? people.get(p.owner_id)?.full_name : null,
        start: fmtDate(p.start_date),
        deadline: fmtDate(p.deadline),
        tags: visibleProjectTags(p.tags),
        progress_pct: progress.pct,
        description: p.description,
        risks: p.risks,
        blockers: p.blockers,
        next_steps: p.next_steps,
        internal_notes: p.internal_notes,
        client_notes: p.client_notes,
        parts: (parts.data ?? []).slice(0, MAX_ROWS).map((x) =>
          compact({
            id: x.id,
            name: x.name,
            status: x.status,
            estimated_hours: x.estimated_hours,
            start: fmtDate(x.start_date),
            end: fmtDate(x.end_date),
            responsible: x.responsible_person_id ? responsibleName.get(x.responsible_person_id) : null,
          })
        ),
        team: (members.data ?? []).slice(0, MAX_ROWS).map((m) =>
          compact({ name: people.get(m.user_id)?.full_name ?? "(not visible)", role: m.role_on_project })
        ),
        milestones: (milestones.data ?? []).slice(0, MAX_ROWS).map((m) => ({ name: m.name, kind: m.kind, due: fmtDate(m.due_on), done: m.done })),
        recent_status_updates: (updates.data ?? []).map((u) =>
          compact({
            date: fmtDate(u.created_at),
            author: people.get(u.author_id)?.full_name,
            completed: u.completed,
            in_progress: u.in_progress,
            blockers: u.blockers,
            next_milestone: u.next_milestone,
            decisions_needed: u.decisions_needed,
          })
        ),
        budget: budgetSummary,
        url: appUrl(`/projects/${p.id}`),
      })
    );
  },
});

const listClients = defineTool({
  name: "list_clients",
  title: "List clients",
  description: "List clients you can see, alphabetically. Optional name filter.",
  inputSchema: z.object({ query: text().optional().describe("Client name (partial match)") }),
  readOnly: true,
  handler: async ({ query }, { supabase }) => {
    let q = supabase.from("clients").select("id, name, reg_code, email, phone, website", { count: "exact" });
    if (query) q = q.ilike("name", `%${escapeIlike(query)}%`);
    const { data, error, count } = await q.order("name").range(0, MAX_ROWS - 1);
    check(error, "clients");
    const rows = (data ?? []).map((c) =>
      compact({ id: c.id, name: c.name, reg_code: c.reg_code, email: c.email, phone: c.phone, website: c.website, url: appUrl(`/clients/${c.id}`) })
    );
    return toText(listResult("clients", rows, count));
  },
});

const getClient = defineTool({
  name: "get_client",
  title: "Get client",
  description: "Client details with contacts and projects.",
  inputSchema: z.object({ client_id: uuid("client_id") }),
  readOnly: true,
  handler: async ({ client_id }, { supabase }) => {
    const { data: c, error } = await supabase
      .from("clients")
      .select("id, name, reg_code, email, phone, website, notes, created_at")
      .eq("id", client_id)
      .maybeSingle();
    check(error, "client");
    if (!c) notFound("Client");
    const [contacts, projects] = await Promise.all([
      supabase
        .from("client_contacts")
        .select("name, role, email, phone, is_primary, description")
        .eq("client_id", client_id)
        .order("is_primary", { ascending: false })
        .order("name"),
      supabase.from("projects").select("id, name, status, deadline").eq("client_id", client_id).order("name").limit(MAX_ROWS + 1),
    ]);
    check(contacts.error ?? projects.error, "client details");
    const projectRows = projects.data ?? [];
    return toText(
      compact({
        id: c.id,
        name: c.name,
        reg_code: c.reg_code,
        email: c.email,
        phone: c.phone,
        website: c.website,
        notes: c.notes,
        since: fmtDate(c.created_at),
        contacts: (contacts.data ?? []).slice(0, MAX_ROWS).map((x) =>
          compact({ name: x.name, role: x.role, email: x.email, phone: x.phone, primary: x.is_primary || null, description: x.description })
        ),
        projects: projectRows.slice(0, MAX_ROWS).map((x) =>
          compact({ id: x.id, name: x.name, status: x.status, deadline: fmtDate(x.deadline), url: appUrl(`/projects/${x.id}`) })
        ),
        projects_truncated: projectRows.length > MAX_ROWS ? `Showing first ${MAX_ROWS} projects; use list_projects with client filter.` : null,
        url: appUrl(`/clients/${c.id}`),
      })
    );
  },
});

const listPeople = defineTool({
  name: "list_people",
  title: "List people",
  description: "List people (employees/contractors) with role, department, current allocation % and vacation status. Active people only unless include_inactive is true.",
  inputSchema: z.object({
    query: text().optional().describe("Name (partial match)"),
    department: text().optional(),
    include_inactive: z.boolean().optional(),
  }),
  readOnly: true,
  handler: async ({ query, department, include_inactive }, { supabase }) => {
    let q = supabase
      .from("person_workload_rows")
      .select("id, full_name, role_title, department, employment_type, status, current_allocation_pct, active_project_count, on_vacation_now, vacation_ends_on", { count: "exact" });
    if (!include_inactive) q = q.eq("status", "active");
    if (query) q = q.ilike("full_name", `%${escapeIlike(query)}%`);
    if (department) q = q.ilike("department", `%${escapeIlike(department)}%`);
    const { data, error, count } = await q.order("full_name").range(0, MAX_ROWS - 1);
    check(error, "people");
    const rows = (data ?? [])
      .filter((p) => p.id)
      .map((p) =>
        compact({
          id: p.id,
          name: p.full_name,
          role: p.role_title,
          department: p.department,
          employment: p.employment_type,
          status: include_inactive ? p.status : null,
          allocation_pct: round1(p.current_allocation_pct),
          active_projects: p.active_project_count,
          on_vacation_until: p.on_vacation_now ? fmtDate(p.vacation_ends_on) : null,
          url: appUrl(`/people/${p.id}`),
        })
      );
    return toText(listResult("people", rows, count));
  },
});

const getPerson = defineTool({
  name: "get_person",
  title: "Get person",
  description: "Person details: role, department, capacity, current allocation, current and upcoming assignments, and current/upcoming time off. Rates appear only if you may see them.",
  inputSchema: z.object({ person_id: uuid("person_id") }),
  readOnly: true,
  handler: async ({ person_id }, ctx) => {
    const { supabase } = ctx;
    const { data: p, error } = await supabase.from("person_workload_rows").select("*").eq("id", person_id).maybeSingle();
    check(error, "person");
    if (!p || !p.id) notFound("Person");
    const today = appDayKey(new Date());
    const [assignments, timeOff, personRow] = await Promise.all([
      supabase
        .from("assignments")
        .select("project_id, allocation_pct, start_date, end_date, role_on_project")
        .eq("person_id", person_id)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order("start_date")
        .limit(MAX_ROWS),
      supabase
        .from("time_off")
        .select("type, starts_on, ends_on, note")
        .eq("person_id", person_id)
        .gte("ends_on", today)
        .order("starts_on")
        .limit(20),
      supabase.from("people").select("email").eq("id", person_id).maybeSingle(),
    ]);
    check(assignments.error ?? timeOff.error ?? personRow.error, "person details");
    const projectNames = await namesById(ctx, "projects", (assignments.data ?? []).map((a) => a.project_id));

    return toText(
      compact({
        id: p.id,
        name: p.full_name,
        email: personRow.data?.email,
        role: p.role_title,
        department: p.department,
        employment: p.employment_type,
        status: p.status,
        skills: p.skills?.length ? p.skills : null,
        weekly_capacity_hours: p.weekly_capacity_hours,
        current_allocation_pct: round1(p.current_allocation_pct),
        billing_rate: p.billing_rate,
        internal_cost: p.internal_cost,
        assignments: (assignments.data ?? []).map((a) =>
          compact({
            project: projectNames.get(a.project_id) ?? "(not visible)",
            project_id: a.project_id,
            allocation_pct: a.allocation_pct,
            from: fmtDate(a.start_date),
            until: fmtDate(a.end_date),
            role: a.role_on_project,
          })
        ),
        time_off: (timeOff.data ?? []).map((t) => compact({ type: t.type, from: fmtDate(t.starts_on), until: fmtDate(t.ends_on), note: t.note })),
        url: appUrl(`/people/${p.id}`),
      })
    );
  },
});

const getWorkload = defineTool({
  name: "get_workload",
  title: "Get workload",
  description: "Weekly allocation % per person (weeks start on Monday). Defaults: from this week, 4 weeks, all active people. >100% means overallocated.",
  inputSchema: z.object({
    from: dateKey.optional().describe("Any date in the first week, YYYY-MM-DD"),
    weeks: z.number().int().min(1).max(12).optional(),
    person_id: uuid("person_id").optional(),
    query: text().optional().describe("Person name (partial match)"),
  }),
  readOnly: true,
  handler: async ({ from, weeks = 4, person_id, query }, { supabase }) => {
    const start = from ? new Date(`${from}T00:00:00Z`) : new Date(`${appDayKey(new Date())}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) throw new ToolError("Invalid input. from: not a valid date");
    const weekStarts = weekStartsFrom(start, weeks);

    let q = supabase
      .from("person_workload_rows")
      .select("id, full_name", { count: "exact" })
      .eq("status", "active");
    if (person_id) q = q.eq("id", person_id);
    if (query) q = q.ilike("full_name", `%${escapeIlike(query)}%`);
    const { data, error, count } = await q.order("full_name").range(0, MAX_ROWS - 1);
    check(error, "people");
    const people = (data ?? []).filter((p): p is { id: string; full_name: string | null } => !!p.id);

    const results = await Promise.all(
      people.map((p) => supabase.rpc("person_weekly_allocation", { p_person: p.id, p_from: weekStarts[0], p_weeks: weeks }))
    );
    const rows = people.map((p, i) => {
      check(results[i].error, "workload");
      const byWeek = new Map((results[i].data ?? []).map((w) => [w.week_start.slice(0, 10), w.allocation_pct]));
      return {
        name: p.full_name,
        id: p.id,
        weeks: Object.fromEntries(weekStarts.map((w) => [fmtDate(w), round1(byWeek.get(w) ?? 0)])),
      };
    });
    return toText({ weeks_from: fmtDate(weekStarts[0]), weeks_to: fmtDate(shiftDayKey(weekStarts[weekStarts.length - 1], 6)), ...listResult("people", rows, count) });
  },
});

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

const listTimeEntries = defineTool({
  name: "list_time_entries",
  title: "List time entries",
  description: "Logged hours, newest first, filtered by person, project and/or month (YYYY-MM). Without person_id or project_id, shows your own entries. Returns the total hours of all matches and up to 50 entries.",
  inputSchema: z.object({
    person_id: uuid("person_id").optional(),
    project_id: uuid("project_id").optional(),
    month: z.string().regex(MONTH, "Use YYYY-MM").optional(),
  }),
  readOnly: true,
  handler: async ({ person_id, project_id, month }, ctx) => {
    const { supabase } = ctx;
    let personId = person_id;
    if (!personId && !project_id) {
      const { data, error } = await supabase.rpc("current_person_id");
      if (error || !data) throw new ToolError("Your account isn't linked to a person record. Pass person_id or project_id.");
      personId = data;
    }
    const FETCH_CAP = 2000;
    let q = supabase
      .from("time_entries")
      .select("entry_date, hours, billable, description, person_id, project_id, project_part_id", { count: "exact" });
    if (personId) q = q.eq("person_id", personId);
    if (project_id) q = q.eq("project_id", project_id);
    if (month) {
      const [, y, m] = MONTH.exec(month)!;
      const first = `${y}-${m}-01`;
      const next = new Date(Date.UTC(Number(y), Number(m), 1)).toISOString().slice(0, 10);
      q = q.gte("entry_date", first).lt("entry_date", next);
    }
    const { data, error, count } = await q.order("entry_date", { ascending: false }).order("id", { ascending: false }).limit(FETCH_CAP);
    check(error, "time entries");
    const entries = data ?? [];

    const shown = entries.slice(0, MAX_ROWS);
    const personIds = [...new Set(shown.map((e) => e.person_id))];
    const [projectNames, partNames, peopleRes] = await Promise.all([
      namesById(ctx, "projects", shown.map((e) => e.project_id)),
      namesById(ctx, "project_parts", shown.map((e) => e.project_part_id)),
      personIds.length ? supabase.from("people").select("id, full_name").in("id", personIds) : Promise.resolve({ data: [], error: null }),
    ]);
    check(peopleRes.error, "people");
    const personNames = new Map((peopleRes.data ?? []).map((p) => [p.id, p.full_name]));

    const totalHours = round1(entries.reduce((s, e) => s + Number(e.hours), 0));
    const billableHours = round1(entries.filter((e) => e.billable).reduce((s, e) => s + Number(e.hours), 0));
    const rows = shown.map((e) =>
      compact({
        date: fmtDate(e.entry_date),
        person: personNames.get(e.person_id),
        project: projectNames.get(e.project_id) ?? "(not visible)",
        part: e.project_part_id ? partNames.get(e.project_part_id) : null,
        hours: e.hours,
        billable: e.billable,
        description: e.description,
      })
    );
    return toText({
      total_hours: totalHours,
      billable_hours: billableHours,
      totals_note: (count ?? 0) > entries.length ? `Totals cover the newest ${entries.length} of ${count} entries; narrow the filters.` : undefined,
      ...listResult("entries", rows, count),
    });
  },
});

const getBudget = defineTool({
  name: "get_budget",
  title: "Get budget",
  description: "Project budget: totals, per-part figures and the 20 latest budget items. Only fields you are allowed to see are returned (internal cost/margin need finance rights).",
  inputSchema: z.object({ project_id: uuid("project_id") }),
  readOnly: true,
  handler: async ({ project_id }, { supabase }) => {
    const { data: b, error } = await supabase.from("project_budget_rows").select("*").eq("id", project_id).maybeSingle();
    check(error, "budget");
    if (!b || !b.id) notFound("Project budget");
    const [parts, budgets] = await Promise.all([
      supabase.from("part_budget_rows").select("*").eq("project_id", project_id).order("part_name"),
      supabase.from("budgets").select("id").eq("project_id", project_id),
    ]);
    check(parts.error ?? budgets.error, "budget details");
    const budgetIds = (budgets.data ?? []).map((x) => x.id);
    const items = budgetIds.length
      ? await supabase
          .from("budget_items")
          .select("id, name, item_type, amount, occurred_on, note")
          .in("budget_id", budgetIds)
          .order("occurred_on", { ascending: false })
          .limit(20)
      : { data: [], error: null };
    check(items.error, "budget items");

    return toText(
      compact({
        project: b.name,
        client: b.client_name,
        budget_type: b.budget_type,
        client_amount: b.client_amount,
        invoiced: b.invoiced,
        paid: b.paid,
        remaining: b.remaining,
        consumption_pct: round1(b.consumption_pct),
        internal_cost: b.internal_cost,
        margin: b.margin,
        margin_pct: round1(b.margin_pct),
        parts: (parts.data ?? []).slice(0, MAX_ROWS).map((x) =>
          compact({
            name: x.part_name,
            billing_model: x.billing_model,
            estimated_hours: x.estimated_hours,
            logged_hours: round1(x.logged_hours),
            billable_hours: round1(x.billable_hours),
            hourly_rate: x.hourly_rate,
            fixed_amount: x.fixed_amount,
            client_price: x.client_price,
            invoiced: x.invoiced,
            paid: x.paid,
            remaining: x.remaining,
            planned_internal_cost: x.planned_internal_cost,
            actual_internal_cost: x.actual_internal_cost,
            margin: x.margin,
            margin_pct: round1(x.margin_pct),
          })
        ),
        latest_items: (items.data ?? []).map((i) =>
          compact({ id: i.id, date: fmtDate(i.occurred_on), type: i.item_type, name: i.name, amount: i.amount, note: i.note })
        ),
        currency: "EUR",
        url: appUrl(`/projects/${b.id}/budget`),
      })
    );
  },
});

export const READ_TOOLS: ToolDef[] = [
  whoami,
  search,
  listProjects,
  getProject,
  listClients,
  getClient,
  listPeople,
  getPerson,
  getWorkload,
  listTimeEntries,
  getBudget,
];
