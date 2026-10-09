import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchCompanyRows } from "@/lib/sales/company-rows";
import { loadSalesPeople } from "./load-pipeline";
import type { CompanyRow } from "./types";

/** Every company the viewer can see (RLS: view_sales) -- deals or not -- with its contacts, open
 * deals and earliest planned step. Earliest step first, then by name. */
export async function loadCompanies(): Promise<CompanyRow[]> {
  const [supabase, salesPeople] = await Promise.all([createClient(), loadSalesPeople()]);
  return fetchCompanyRows(supabase, new Map(salesPeople.map((p) => [p.id, p])));
}
