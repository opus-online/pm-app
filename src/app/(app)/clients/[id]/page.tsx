import Link from "next/link";
import { notFound } from "next/navigation";
import { HandshakeIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { avatarTint } from "@/lib/avatar-tint";
import { formatMoney } from "@/lib/budget";
import { NEUTRAL_ACTION_CLASS } from "@/lib/action-styles";
import { type ProgressPart, deriveProgress } from "@/lib/progress";
import {
  CATEGORY_STYLE, categoryOf, humanizeAction, type AuditLogRow,
} from "../../activity/types";
import { formatDate, initials } from "../../projects/types";
import type { ProjectListRow } from "../../projects/types";
import {
  ProjectsTable, type ProgressById, type ProjectRowLinks,
} from "../../projects/projects-table";
import { ClientFormDialog } from "../client-form-dialog";
import type { ClientContactRow, ClientRow } from "../types";
import { ClientHeaderStrip } from "./client-header-strip";

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// Client workspace: identity + summary strip + contacts + the client's projects in the exact
// projects-list table + notes + recent audit activity. This is the destination for every
// client-name link across the app (projects list, budgets, clients list).
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Guard wave: the RLS-scoped client read ("view clients" -- a member/viewer simply gets no
  // row -> 404, never an existence leak) plus the viewer, which everything below depends on.
  const [{ data: client }, current] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle<ClientRow>(),
    getCurrentUser(),
  ]);
  if (!client) notFound();

  // UX gating only -- the real security boundary is requirePermission() inside the client/
  // project server actions, which re-check has_permission server-side regardless of what's
  // rendered here.
  const isAdmin = current?.role === "admin";

  // Wave 1: everything that depends only on the client id / viewer (perf convention: one
  // parallel round trip, never sequential awaits).
  const [
    { data: projectRefs },
    { data: contactRows },
    { data: canManageRes },
    { data: canCreateRes },
    { data: canViewSalesRes },
  ] = await Promise.all([
    // pm_id rides along so the editable-ids check below needs no second projects read.
    supabase.from("projects").select("id, pm_id").eq("client_id", id),
    // Primary first, then alphabetical -- the contact card grid renders this order as-is.
    supabase
      .from("client_contacts")
      .select("*")
      .eq("client_id", id)
      .order("is_primary", { ascending: false })
      .order("name"),
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_clients" })
      : Promise.resolve({ data: false }),
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "create_project" })
      : Promise.resolve({ data: false }),
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "view_sales" })
      : Promise.resolve({ data: false }),
  ]);
  const contacts = (contactRows ?? []) as ClientContactRow[];
  const canManage = !!canManageRes;
  const canCreate = !!canCreateRes;
  const canViewSales = !!canViewSalesRes;
  const projectIds = (projectRefs ?? []).map((p) => p.id);

  // Recent client-related audit events: client events plus events on this client's projects
  // (project.* actions carry the project as resource_id; part/member/budget/... actions carry
  // it as metadata.project_id -- see resolveProjectId in activity/types.ts).
  const idList = projectIds.join(",");
  const auditQuery = projectIds.length
    ? supabase
        .from("audit_logs")
        .select("*")
        .or(
          `and(resource_type.eq.client,resource_id.eq.${id}),resource_id.in.(${idList}),metadata->>project_id.in.(${idList})`
        )
    : supabase.from("audit_logs").select("*").eq("resource_type", "client").eq("resource_id", id);

  // Wave 2: everything that depends on the project-id list. The three ProjectsTable inputs
  // (editable ids / links / progress) are computed exactly like projects/page.tsx, just scoped
  // to this client's projects -- deliberately duplicated, see that file for the rationale.
  const [
    { data: listRows },
    { data: partRows },
    { data: peopleRefs },
    { data: adhocGrants },
    { data: auditRows },
  ] = await Promise.all([
    projectIds.length
      ? supabase
          .from("project_list_rows")
          .select("*")
          .in("id", projectIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] as ProjectListRow[] }),
    projectIds.length
      ? supabase
          .from("project_parts")
          .select("project_id, status, estimated_hours")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as { project_id: string; status: string; estimated_hours: number | null }[] }),
    // PM cross-link targets (the list view carries names only; RLS-scoped like everywhere else).
    projectIds.length
      ? supabase.from("people").select("id, user_id").not("user_id", "is", null)
      : Promise.resolve({ data: [] as { id: string; user_id: string | null }[] }),
    current && !isAdmin && projectIds.length
      ? supabase
          .from("user_project_permissions")
          .select("project_id, expires_at")
          .eq("user_id", current.user.id)
          .eq("permission_key", "edit_project")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as { project_id: string; expires_at: string | null }[] }),
    // audit_logs RLS restricts reads to view_audit holders -- most PMs simply get zero rows
    // back (not an error), and the Activity section below renders only when rows came back.
    auditQuery.order("created_at", { ascending: false }).limit(8),
  ]);
  const logs = (auditRows ?? []) as AuditLogRow[];

  // Mirrors has_permission('edit_project', project) without an RPC per row -- same reasoning
  // as projects/page.tsx: admin bypasses everything; project_manager holds edit_project with
  // scope 'own_projects' (pm_id = uid); user_project_permissions covers ad-hoc grants.
  const editableProjectIds = new Set<string>();
  if (current && projectIds.length > 0) {
    if (isAdmin) {
      for (const pid of projectIds) editableProjectIds.add(pid);
    } else {
      if (current.role === "project_manager") {
        for (const p of projectRefs ?? []) {
          if (p.pm_id === current.user.id) editableProjectIds.add(p.id);
        }
      }
      const now = new Date();
      for (const g of adhocGrants ?? []) {
        if (!g.expires_at || new Date(g.expires_at) > now) editableProjectIds.add(g.project_id);
      }
    }
  }

  // Cross-link targets: every row's client is this page's client; PM links resolve through the
  // people directory (same as projects/page.tsx).
  const personIdByUserId = new Map(
    (peopleRefs ?? []).filter((p) => p.user_id).map((p) => [p.user_id as string, p.id])
  );
  const links: ProjectRowLinks = {};
  for (const p of projectRefs ?? []) {
    links[p.id] = {
      clientId: id,
      pmPersonId: p.pm_id ? (personIdByUserId.get(p.pm_id) ?? null) : null,
    };
  }

  // Derived progress per project -- same deriveProgress + compact label as projects/page.tsx.
  const partsByProject = new Map<string, ProgressPart[]>();
  for (const p of partRows ?? []) {
    const list = partsByProject.get(p.project_id) ?? [];
    list.push({ status: p.status, estimated_hours: p.estimated_hours });
    partsByProject.set(p.project_id, list);
  }
  const progressById: ProgressById = {};
  for (const pid of projectIds) {
    const derived = deriveProgress(partsByProject.get(pid) ?? []);
    const label =
      derived.basis === "hours"
        ? `${round1(derived.doneHours)} / ${round1(derived.totalHours)} h`
        : derived.basis === "count"
          ? `${derived.donePartCount} / ${derived.totalPartCount} parts`
          : "No parts yet";
    progressById[pid] = { pct: derived.pct, label };
  }

  // Strip + metadata rollups from the RLS'd list rows (a viewer who can't see every project
  // undercounts -- same caveat as every RLS-scoped rollup in this app).
  const validRows = (listRows ?? []).filter((r): r is ProjectListRow & { id: string } => !!r.id);
  const activeCount = validRows.filter((r) => r.status === "active").length;
  const completedCount = validRows.filter((r) => r.status === "completed").length;
  const budgetRows = validRows.filter((r) => r.budget_total !== null);
  const totalBudget = budgetRows.length
    ? budgetRows.reduce((sum, r) => sum + (r.budget_total ?? 0), 0)
    : null;
  const pmNames = Array.from(
    new Set(validRows.map((r) => r.pm_name).filter((n): n is string => !!n))
  ).sort();
  const primaryContact = contacts.find((c) => c.is_primary) ?? null;

  return (
    <div className="space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/clients" />}>Clients</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{client.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`flex size-12 shrink-0 items-center justify-center rounded-lg text-base font-medium ${avatarTint(client.name)}`}
          >
            {initials(client.name)}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{client.name}</h1>
            {/* "Client since" lives here instead of a dedicated Client-information panel: the
                only real schema field left for such a panel is created_at, and a card with one
                date read as filler. */}
            <p className="mt-0.5 text-sm text-muted-foreground">
              {contacts.length} contact{contacts.length === 1 ? "" : "s"}
              <span className="mx-1.5 text-border">·</span>
              {activeCount} active project{activeCount === 1 ? "" : "s"}
              {totalBudget !== null && (
                <>
                  <span className="mx-1.5 text-border">·</span>
                  {formatMoney(totalBudget)} budget
                </>
              )}
              <span className="mx-1.5 text-border">·</span>
              Client since {formatDate(client.created_at)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canViewSales && (
            <Button
              size="sm"
              variant="ghost"
              className={NEUTRAL_ACTION_CLASS}
              render={<Link href={`/sales/companies/${client.id}`} />}
            >
              <HandshakeIcon />
              Sales
            </Button>
          )}
          {canManage && <ClientFormDialog client={client} contacts={contacts} />}
        </div>
      </div>

      <ClientHeaderStrip
        projects={{ total: validRows.length, active: activeCount, completed: completedCount }}
        budget={totalBudget !== null ? { total: totalBudget, projectCount: budgetRows.length } : null}
        contacts={{ count: contacts.length, primaryName: primaryContact?.name ?? null }}
        pmNames={pmNames}
      />

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Contacts ({contacts.length})
        </h2>
        {contacts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No contacts yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {contacts.map((contact) => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Projects ({validRows.length})
          </h2>
          {canCreate && (
            <Button size="sm" render={<Link href="/projects/new" />}>
              New project
            </Button>
          )}
        </div>
        {validRows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No visible projects for this client.
          </div>
        ) : (
          <ProjectsTable
            rows={validRows}
            editableProjectIds={[...editableProjectIds]}
            links={links}
            progressById={progressById}
            initiallyHidden={["client"]}
          />
        )}
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {client.notes ? (
            <p className="whitespace-pre-line">{client.notes}</p>
          ) : (
            <p className="text-muted-foreground">No notes yet.</p>
          )}
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Activity</CardTitle>
            <CardDescription>
              {logs.length} recent event{logs.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="-mx-2">
              {logs.map((log) => {
                const category = categoryOf(log.action);
                const style = CATEGORY_STYLE[category];
                return (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{humanizeAction(log.action)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {log.actor_email ?? "system"}
                        <span className="mx-1.5 text-border">·</span>
                        {formatDate(log.created_at)}
                      </span>
                    </span>
                    <Badge variant={style.variant} className={style.className}>
                      {category}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// One contact per compact card: tinted initials chip + the same three-level hierarchy as the
// clients list's contacts cell (name / role / reachability), em-dash for missing fields.
function ContactCard({ contact }: { contact: ClientContactRow }) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-medium ${avatarTint(contact.name)}`}
          >
            {initials(contact.name)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium">{contact.name}</span>
              {contact.is_primary && <Badge variant="outline">Primary</Badge>}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{contact.role ?? "—"}</div>
            <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground/70">
              <div className="truncate">
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="hover:underline">
                    {contact.email}
                  </a>
                ) : (
                  "—"
                )}
              </div>
              <div className="truncate">
                {contact.phone ? (
                  <a href={`tel:${contact.phone}`} className="hover:underline">
                    {contact.phone}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
