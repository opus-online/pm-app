import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import type { NextStep } from "@/lib/sales/next-step";
import { latestOffer } from "@/lib/sales/pipeline";
import { compareDueDates } from "@/lib/sales/urgency";
import { appDayKey } from "@/lib/time-zone";
import { CLOSED_STAGES, type OfferLite } from "@/lib/sales/types";
import type { CompanyOption, PipelineRow, SalesOwnerOption } from "./types";

// Deduped per request: loadPipeline, loadCompanies and loadSalesOwners all need it.
export const loadSalesPeople = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sales_people");
  return data ?? [];
});

type SalesPerson = Awaited<ReturnType<typeof loadSalesPeople>>[number];
type NextStepViewRow = Database["public"]["Views"]["company_next_steps"]["Row"];

/** A company_next_steps / deal_next_steps row as an allowlisted NextStep (field by field);
 * null when the row is incomplete or not a user-plannable kind. */
export function toNextStep(
  r: Pick<NextStepViewRow, "activity_id" | "due_on" | "kind" | "body" | "assignee_id" | "deal_id" | "contact_id">,
  people: Map<string, SalesPerson>
): NextStep | null {
  if (!r.activity_id || !r.due_on || r.body === null || !r.kind || r.kind === "system") return null;
  const person = r.assignee_id ? people.get(r.assignee_id) : undefined;
  return {
    activity_id: r.activity_id,
    due_on: r.due_on,
    kind: r.kind,
    body: r.body,
    assignee: r.assignee_id
      ? { id: r.assignee_id, name: person?.name ?? "Unknown", avatar_url: person?.avatar_url ?? null }
      : null,
    deal_id: r.deal_id,
    contact_id: r.contact_id,
  };
}

/** Every deal the viewer can see (RLS: view_sales) with its own next step, shaped field-by-field
 * for the board, earliest step first. */
export async function loadPipeline(): Promise<PipelineRow[]> {
  const supabase = await createClient();
  // One parallel round trip. People come from the sales_people() definer read: user_profiles RLS
  // only exposes the viewer's own row, so a plain select couldn't name the other deal owners.
  // Kind comes from prospect_client_ids() (definer, same answer as company_kind) rather than an
  // RLS-scoped projects read, which would misclassify clients whose projects the viewer can't see.
  const [dealsRes, stepsRes, salesPeople, prospectsRes] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "id, title, stage, source, won_at, owner_id, client_id, clients(id, name, reg_code), offers(amount, status, sent_on, created_at)"
      ),
    supabase
      .from("deal_next_steps")
      .select("activity_id, deal_id, due_on, kind, body, assignee_id, contact_id"),
    loadSalesPeople(),
    supabase.rpc("prospect_client_ids"),
  ]);
  if (dealsRes.error) throw new Error("Failed to load deals");
  if (stepsRes.error) throw new Error("Failed to load next steps");
  if (prospectsRes.error) throw new Error("Failed to load companies");

  const people = new Map(salesPeople.map((p) => [p.id, p]));
  const prospectIds = new Set(prospectsRes.data ?? []);
  const stepByDeal = new Map<string, NextStep>();
  for (const s of stepsRes.data ?? []) {
    const step = s.deal_id ? toNextStep(s, people) : null;
    if (s.deal_id && step) stepByDeal.set(s.deal_id, step);
  }

  const rows: PipelineRow[] = [];
  for (const d of dealsRes.data ?? []) {
    const company = d.clients;
    if (!company) continue;
    const offers: OfferLite[] = (d.offers ?? []).map((o) => ({
      amount: Number(o.amount),
      status: o.status,
      sent_on: o.sent_on,
      created_at: o.created_at,
    }));
    const owner = people.get(d.owner_id);
    rows.push({
      id: d.id,
      title: d.title,
      stage: d.stage,
      source: d.source,
      won_at: d.won_at,
      client: {
        id: company.id,
        name: company.name,
        reg_code: company.reg_code,
        kind: prospectIds.has(company.id) ? "prospect" : "client",
      },
      owner: {
        id: d.owner_id,
        name: owner?.name ?? "Unknown",
        avatar_url: owner?.avatar_url ?? null,
      },
      latest_offer_amount: latestOffer(offers)?.amount ?? null,
      offers,
      next_step: stepByDeal.get(d.id) ?? null,
    });
  }
  return rows.sort(
    (a, b) =>
      compareDueDates(a.next_step?.due_on ?? null, b.next_step?.due_on ?? null) ||
      a.client.name.localeCompare(b.client.name)
  );
}

/** Steps due KPI: every planned step due today or earlier (Tallinn day) that the viewer can see
 * (RLS: view_sales) -- all of them, not just each company's earliest -- except steps on closed
 * (won/lost) deals, which the next-step views leave out too. Two head-only counts: all due, minus
 * the due ones whose deal is closed. With `assigneeId`, only that person's steps. */
export async function loadStepsDueCount(assigneeId?: string): Promise<number> {
  const supabase = await createClient();
  const today = appDayKey(Date.now());
  let allQ = supabase
    .from("crm_activities")
    .select("id", { count: "exact", head: true })
    .eq("status", "planned")
    .lte("due_on", today);
  let closedQ = supabase
    .from("crm_activities")
    .select("id, deals!inner(stage)", { count: "exact", head: true })
    .eq("status", "planned")
    .lte("due_on", today)
    .in("deals.stage", CLOSED_STAGES);
  if (assigneeId) {
    allQ = allQ.eq("assignee_id", assigneeId);
    closedQ = closedQ.eq("assignee_id", assigneeId);
  }
  const [allRes, closedRes] = await Promise.all([allQ, closedQ]);
  if (allRes.error || closedRes.error) throw new Error("Failed to load next steps");
  return Math.max(0, (allRes.count ?? 0) - (closedRes.count ?? 0));
}

/** Who a deal can be assigned to: active users holding sales or admin, by name. */
export async function loadSalesOwners(): Promise<SalesOwnerOption[]> {
  return (await loadSalesPeople())
    .filter((p) => p.assignable)
    .map((p) => ({ id: p.id, name: p.name, avatar_url: p.avatar_url ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCompanyOptions(): Promise<CompanyOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, name, reg_code").order("name");
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, reg_code: c.reg_code }));
}
