// Roles held alongside a user's single main role (see set_sales_access RPC).
export const ADDON_ROLES = ["sales"] as const;

export function pickMainRole(roleKeys: string[]): string | null {
  return roleKeys.find((r) => !(ADDON_ROLES as readonly string[]).includes(r)) ?? null;
}
