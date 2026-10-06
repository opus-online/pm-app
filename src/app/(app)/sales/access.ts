import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";

/** The viewer's Sales permissions, deduped per request: sales/layout.tsx gates on `canView` and
 * every page under it reads the same answer (plus `canManage`) without another round trip.
 * UX gating only -- data is RLS-scoped on view_sales and every write re-checks manage_sales in
 * actions/sales.ts. */
export const getSalesAccess = cache(async () => {
  const current = await getCurrentUser();
  if (!current) return null;
  const supabase = await createClient();
  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { uid: current.user.id, perm: "view_sales" }),
    supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_sales" }),
  ]);
  return { current, canView: canView === true, canManage: canManage === true };
});
