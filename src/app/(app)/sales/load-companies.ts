import "server-only";
import { createClient } from "@/lib/supabase/server";
import { latestOffer } from "@/lib/sales/pipeline";
import { OPEN_STAGES, type OfferLite } from "@/lib/sales/types";
import { compareDueDates } from "@/lib/sales/urgency";
import { loadSalesPeople, toNextStep } from "./load-pipeline";
import type { CompanyRow, PipelineContact } from "./types";

/** Every company the viewer can see (RLS: view_sales) -- deals or not -- with its contacts, open
 * deals and earliest planned step, shaped field by field. Earliest step first, then by name. */
export async function loadCompanies(): Promise<CompanyRow[]> {
  const supabase = await createClient();
  const [clientsRes, contactsRes, dealsRes, stepsRes, prospectsRes, salesPeople] = await Promise.all([
    supabase.from("clients").select("id, name, reg_code"),
    supabase.from("client_contacts").select("id, client_id, name, phone, email").order("name"),
    supabase.from("deals").select("id, client_id, stage, offers(amount, status, sent_on, created_at)"),
    supabase
      .from("company_next_steps")
      .select("client_id, activity_id, deal_id, due_on, kind, body, assignee_id, contact_id"),
    supabase.rpc("prospect_client_ids"),
    loadSalesPeople(),
  ]);
  if (clientsRes.error) throw new Error("Failed to load companies");
  if (contactsRes.error) throw new Error("Failed to load contacts");
  if (dealsRes.error) throw new Error("Failed to load deals");
  if (stepsRes.error) throw new Error("Failed to load next steps");
  if (prospectsRes.error) throw new Error("Failed to load companies");

  const people = new Map(salesPeople.map((p) => [p.id, p]));
  const prospectIds = new Set(prospectsRes.data ?? []);

  const contactsByClient = new Map<string, PipelineContact[]>();
  for (const c of contactsRes.data ?? []) {
    const list = contactsByClient.get(c.client_id) ?? [];
    list.push({ id: c.id, name: c.name, phone: c.phone, email: c.email });
    contactsByClient.set(c.client_id, list);
  }

  const dealsByClient = new Map<string, { deals: CompanyRow["open_deals"]; value: number }>();
  for (const d of dealsRes.data ?? []) {
    if (!OPEN_STAGES.includes(d.stage)) continue;
    const offers: OfferLite[] = (d.offers ?? []).map((o) => ({
      amount: Number(o.amount),
      status: o.status,
      sent_on: o.sent_on,
      created_at: o.created_at,
    }));
    const entry = dealsByClient.get(d.client_id) ?? { deals: [], value: 0 };
    entry.deals.push({ id: d.id, stage: d.stage });
    entry.value += latestOffer(offers)?.amount ?? 0;
    dealsByClient.set(d.client_id, entry);
  }

  const stepByClient = new Map<string, NonNullable<CompanyRow["next_step"]>>();
  for (const s of stepsRes.data ?? []) {
    const step = s.client_id ? toNextStep(s, people) : null;
    if (s.client_id && step) stepByClient.set(s.client_id, step);
  }

  const rows: CompanyRow[] = (clientsRes.data ?? []).map((c) => {
    const deals = dealsByClient.get(c.id);
    return {
      id: c.id,
      name: c.name,
      reg_code: c.reg_code,
      kind: prospectIds.has(c.id) ? "prospect" : "client",
      contacts: contactsByClient.get(c.id) ?? [],
      open_deals: deals?.deals ?? [],
      open_value: deals?.value ?? 0,
      next_step: stepByClient.get(c.id) ?? null,
    };
  });
  return rows.sort(
    (a, b) =>
      compareDueDates(a.next_step?.due_on ?? null, b.next_step?.due_on ?? null) ||
      a.name.localeCompare(b.name)
  );
}
