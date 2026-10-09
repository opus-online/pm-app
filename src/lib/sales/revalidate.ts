import { revalidatePath } from "next/cache";

/** Revalidates the Sales list and a company's page after a Sales write. Shared by the app's
 * server actions and the MCP Sales tools (route handler: refreshed on the next visit).
 * `clients` also refreshes the general Clients pages (a new company / contact shows there too). */
export function revalidateSales(clientId?: string | null, opts?: { clients?: boolean }): void {
  revalidatePath("/sales");
  if (clientId) revalidatePath(`/sales/companies/${clientId}`);
  if (opts?.clients) {
    revalidatePath("/clients");
    if (clientId) revalidatePath(`/clients/${clientId}`);
  }
}
