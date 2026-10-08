import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getSalesAccess } from "../../access";
import { compareDueDates } from "@/lib/sales/urgency";
import { loadCompanyOptions, loadSalesOwners, loadSalesPeople, toNextStep } from "../../load-pipeline";
import type { ActivityView, CompanyView, ContactView, DealView, NextStepView } from "../../types";
import type {
  ClientContactOption, ClientOption, PmOption,
} from "../../../projects/new/project-create-fields";
import { ActivityComposer } from "./activity-composer";
import { ActivityTimeline } from "./activity-timeline";
import { CompanyHeader } from "./company-header";
import { ContactsCard } from "./contacts-card";
import { DealSheet, type ProjectDialogData } from "./deal-sheet";
import { DealsCard } from "./deals-card";
import { NextStepsCard } from "./next-steps-card";
import { PlanStepProvider } from "./plan-step-context";

// Company workspace: who the company is, its deals and contacts on the left, and everything that
// happened with it on the right. Every deal link in Sales lands here with ?deal=<id>.
export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ deal?: string }>;
}) {
  const [{ id }, { deal: dealParam }, access] = await Promise.all([params, searchParams, getSalesAccess()]);
  // sales/layout.tsx already gates view_sales; kept here as defense in depth (request-cached).
  if (!access?.canView) notFound();
  // Not a uuid -> 404 instead of a Postgres cast error.
  if (!z.guid().safeParse(id).success) notFound();
  const { current, canManage } = access;

  const supabase = await createClient();
  // One parallel round trip. Names come from sales_people() (definer read, shared with the
  // pipeline via React cache): user_profiles RLS hides other users' rows from non-admin sales.
  const [clientRes, kindRes, contactsRes, dealsRes, activitiesRes, stepsRes, people, owners, companies] = await Promise.all([
    supabase.from("clients").select("id, name, reg_code, phone, email, website, notes").eq("id", id).maybeSingle(),
    supabase.rpc("company_kind", { company: id }),
    supabase
      .from("client_contacts")
      .select("id, first_name, last_name, name, gender, email, phone, role, description")
      .eq("client_id", id)
      .order("is_primary", { ascending: false })
      .order("name"),
    supabase
      .from("deals")
      .select(
        "id, title, stage, source, owner_id, lost_reason, project_id, offers(id, title, amount, status, sent_on, valid_until, link_url, note, created_at)"
      )
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_activities")
      .select("id, kind, body, occurred_at, deal_id, contact_id, actor_id, status, due_on, assignee_id, done_at, done_by, done_comment")
      .eq("client_id", id)
      .eq("status", "done")
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    // Open steps live in the Next steps card, not in the timeline.
    supabase
      .from("crm_activities")
      .select("id, kind, body, due_on, deal_id, contact_id, assignee_id")
      .eq("client_id", id)
      .eq("status", "planned")
      .order("due_on")
      .order("created_at"),
    loadSalesPeople(),
    // New-deal dialog pickers, only for users who can create deals.
    canManage ? loadSalesOwners() : Promise.resolve([]),
    canManage ? loadCompanyOptions() : Promise.resolve([]),
  ]);
  // A failed read must not masquerade as "not found", an empty list or a wrong Prospect label.
  if (clientRes.error || kindRes.error || contactsRes.error || dealsRes.error || activitiesRes.error || stepsRes.error) {
    throw new Error("Failed to load the company");
  }
  const client = clientRes.data;
  if (!client) notFound();

  const company: CompanyView = {
    id: client.id,
    name: client.name,
    reg_code: client.reg_code,
    phone: client.phone,
    email: client.email,
    website: client.website,
    notes: client.notes,
    kind: kindRes.data === "prospect" ? "prospect" : "client",
  };

  const contacts: ContactView[] = (contactsRes.data ?? []).map((c) => ({
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    name: c.name,
    gender: c.gender,
    email: c.email,
    phone: c.phone,
    role: c.role,
    description: c.description,
  }));

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const person = (uid: string) => {
    const p = peopleById.get(uid);
    return { id: uid, name: p?.name ?? "Unknown", avatar_url: p?.avatar_url ?? null };
  };

  // Already ordered due_on, created_at -- the same order deal_next_steps picks a deal's first from.
  const plannedSteps = (stepsRes.data ?? []).flatMap((s) => {
    const step = toNextStep({ ...s, activity_id: s.id }, peopleById);
    return step ? [step] : [];
  });
  const stepByDeal = new Map<string, (typeof plannedSteps)[number]>();
  for (const s of plannedSteps) if (s.deal_id && !stepByDeal.has(s.deal_id)) stepByDeal.set(s.deal_id, s);

  const deals: DealView[] = (dealsRes.data ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    stage: d.stage,
    source: d.source,
    owner: person(d.owner_id),
    next_step: stepByDeal.get(d.id) ?? null,
    lost_reason: d.lost_reason,
    project_id: d.project_id,
    offers: (d.offers ?? []).map((o) => ({
      id: o.id,
      title: o.title,
      amount: Number(o.amount),
      status: o.status,
      sent_on: o.sent_on,
      valid_until: o.valid_until,
      link_url: o.link_url,
      note: o.note,
      created_at: o.created_at,
    })),
  }));

  const dealTitle = new Map(deals.map((d) => [d.id, d.title]));
  const contactName = new Map(contacts.map((c) => [c.id, c.name]));
  const activities: ActivityView[] = (activitiesRes.data ?? [])
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      body: a.body,
      occurred_at: a.occurred_at,
      deal_id: a.deal_id,
      deal_title: a.deal_id ? (dealTitle.get(a.deal_id) ?? null) : null,
      contact_name: a.contact_id ? (contactName.get(a.contact_id) ?? null) : null,
      actor: a.actor_id ? person(a.actor_id) : null,
      is_mine: a.actor_id === current.user.id,
      status: a.status,
      due_on: a.due_on,
      assignee: a.assignee_id ? person(a.assignee_id) : null,
      done_at: a.done_at,
      done_by: a.done_by ? person(a.done_by) : null,
      done_comment: a.done_comment,
    }))
    // A completed step sits on the day it was done, not the day it was planned.
    .sort((a, b) => Date.parse(b.done_at ?? b.occurred_at) - Date.parse(a.done_at ?? a.occurred_at));

  const steps: NextStepView[] = plannedSteps
    .map((s) => ({
      ...s,
      contact_name: s.contact_id ? (contactName.get(s.contact_id) ?? null) : null,
      deal_title: s.deal_id ? (dealTitle.get(s.deal_id) ?? null) : null,
    }))
    .sort((a, b) => compareDueDates(a.due_on, b.due_on));

  // ?deal= that doesn't belong to this company is ignored rather than trusted.
  const activeDeal = deals.find((d) => d.id === dealParam) ?? null;

  // "Create project" options (same data as the Projects page dialog), only when someone could
  // actually use them: a manager looking at a won deal that has no project yet, who may create
  // projects at all (the sales role alone can't).
  const projectDialogData = canManage && deals.some((d) => d.stage === "won" && !d.project_id)
    ? await loadProjectDialogData(supabase, current)
    : null;

  return (
    <PlanStepProvider>
      <div className="space-y-6">
        <div className="space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/sales" />}>Sales</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{company.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <CompanyHeader company={company} canManage={canManage} />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-6">
            <DealsCard
              deals={deals}
              company={company}
              activeDealId={activeDeal?.id ?? null}
              canManage={canManage}
              owners={owners}
              companies={companies}
              currentUserId={current.user.id}
            />
            <ContactsCard companyId={company.id} contacts={contacts} canManage={canManage} />
          </div>
          <div className="min-w-0 space-y-6">
            <NextStepsCard
              steps={steps}
              people={owners}
              canManage={canManage}
              currentUserId={current.user.id}
            />
            {canManage && (
              <ActivityComposer
                companyId={company.id}
                contacts={contacts}
                deals={deals}
                people={owners}
                currentUserId={current.user.id}
                activeDealId={activeDeal?.id ?? null}
              />
            )}
            <ActivityTimeline activities={activities} canManage={canManage} />
          </div>
        </div>

        <DealSheet
          deal={activeDeal}
          company={company}
          activities={activities}
          owners={owners}
          canManage={canManage}
          projectDialogData={projectDialogData}
        />
      </div>
    </PlanStepProvider>
  );
}

async function loadProjectDialogData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  current: NonNullable<Awaited<ReturnType<typeof getSalesAccess>>>["current"]
): Promise<ProjectDialogData | null> {
  const { data: canCreate } = await supabase.rpc("has_permission", {
    uid: current.user.id,
    perm: "create_project",
  });
  if (canCreate !== true) return null;

  const [clientsRes, contactsRes, pmsRes] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("client_contacts").select("id, client_id, name, email").order("name"),
    supabase.rpc("pm_options"),
  ]);
  if (clientsRes.error || contactsRes.error || pmsRes.error) throw new Error("Failed to load project options");

  const clients: ClientOption[] = clientsRes.data.map((c) => ({ id: c.id, name: c.name }));
  const contacts: ClientContactOption[] = contactsRes.data.map((c) => ({
    id: c.id,
    client_id: c.client_id,
    name: c.name,
    email: c.email,
  }));
  const pms: PmOption[] = (pmsRes.data ?? []).map((p) => ({ user_id: p.user_id, full_name: p.full_name }));
  if (!pms.some((pm) => pm.user_id === current.user.id)) {
    pms.unshift({ user_id: current.user.id, full_name: current.profile.full_name ?? current.profile.email });
  }
  return { clients, contacts, pms, currentUserId: current.user.id };
}
