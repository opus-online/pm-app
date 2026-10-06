import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { latestOffer } from "@/lib/sales/pipeline";
import { compareByFollowUp } from "@/lib/sales/urgency";
import type { OfferLite } from "@/lib/sales/types";
import type { CompanyOption, PipelineContact, PipelineRow, SalesOwnerOption } from "./types";

// Deduped per request: loadPipeline and loadSalesOwners both need it.
export const loadSalesPeople = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sales_people");
  return data ?? [];
});

/** Every deal the viewer can see (RLS: view_sales), shaped field-by-field for the client,
 * most urgent follow-up first. */
export async function loadPipeline(): Promise<PipelineRow[]> {
  const supabase = await createClient();
  // One parallel round trip. People come from the sales_people() definer read: user_profiles RLS
  // only exposes the viewer's own row, so a plain select couldn't name the other deal owners.
  // Kind comes from prospect_client_ids() (definer, same answer as company_kind) rather than an
  // RLS-scoped projects read, which would misclassify clients whose projects the viewer can't see.
  const [dealsRes, contactsRes, salesPeople, prospectsRes] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "id, title, stage, source, next_follow_up_on, won_at, owner_id, client_id, clients(id, name, reg_code), offers(amount, status, sent_on, created_at)"
      ),
    supabase.from("client_contacts").select("id, client_id, name, phone, email").order("name"),
    loadSalesPeople(),
    supabase.rpc("prospect_client_ids"),
  ]);
  if (dealsRes.error) throw new Error("Failed to load deals");

  const contactsByClient = new Map<string, PipelineContact[]>();
  for (const c of contactsRes.data ?? []) {
    const list = contactsByClient.get(c.client_id) ?? [];
    list.push({ id: c.id, name: c.name, phone: c.phone, email: c.email });
    contactsByClient.set(c.client_id, list);
  }
  const people = new Map(salesPeople.map((p) => [p.id, p]));
  const prospectIds = new Set(prospectsRes.data ?? []);

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
      next_follow_up_on: d.next_follow_up_on,
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
      contacts: contactsByClient.get(company.id) ?? [],
      latest_offer_amount: latestOffer(offers)?.amount ?? null,
      offers,
    });
  }
  return rows.sort(compareByFollowUp);
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
