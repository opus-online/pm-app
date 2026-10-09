// Sales ownership/duplicate checks that run against whatever client the caller holds -- the
// cookie client in the app's server actions, the user-scoped key client in the MCP tools -- so RLS
// applies the same way in both. No "server-only": importable from vitest.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { normalizeRegCode } from "@/lib/sales/reg-code";

type Client = SupabaseClient<Database>;

export const CROSS_COMPANY_MESSAGE = "That deal/contact belongs to another company.";

/** deal_id/contact_id must belong to the same client_id, or a user could log/plan an activity
 * against another company's deal/contact by id. Returns the error text, or null when fine. */
export async function assertStepRefsBelongToClient(
  supabase: Client,
  clientId: string,
  dealId?: string | null,
  contactId?: string | null
): Promise<string | null> {
  if (dealId) {
    const { data: deal } = await supabase.from("deals").select("client_id").eq("id", dealId).single();
    if (!deal || deal.client_id !== clientId) return CROSS_COMPANY_MESSAGE;
  }
  if (contactId) {
    const { data: contact } = await supabase.from("client_contacts").select("client_id").eq("id", contactId).single();
    if (!contact || contact.client_id !== clientId) return CROSS_COMPANY_MESSAGE;
  }
  return null;
}

/** The company (other than exceptId) already holding this registry code, compared normalized. */
export async function existingByRegCode(supabase: Client, regCode: string | null, exceptId?: string | null) {
  const norm = normalizeRegCode(regCode);
  if (!norm) return null;
  const { data } = await supabase.from("clients").select("id, name, reg_code").not("reg_code", "is", null);
  return (data ?? []).find((c) => normalizeRegCode(c.reg_code) === norm && c.id !== exceptId) ?? null;
}
