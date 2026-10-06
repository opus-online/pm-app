import { notFound } from "next/navigation";
import { getSalesAccess } from "./access";

/** One gate for the whole Sales area (/sales and /sales/companies/*): no view_sales -> 404, the
 * same answer as a URL that doesn't exist. Pages re-read getSalesAccess() (request-cached, so no
 * extra round trip) and keep their own check as defense in depth -- a layout doesn't re-render on
 * every client-side navigation between its children. */
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const access = await getSalesAccess();
  if (!access?.canView) notFound();
  return children;
}
