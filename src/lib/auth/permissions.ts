// Isomorphic permission catalog — importable from client components (labels, UI gating)
// as well as server code. No server-only imports here; see require-permission.ts for the
// server-only enforcement helper.

export const PERMISSIONS = [
  "view_project","edit_project","create_project","edit_status",
  "view_team","manage_project_members","view_links","manage_links",
  "view_budget","manage_budget","view_internal_cost",
  "view_clients","manage_clients","view_people","manage_people",
  "log_time","view_time",
  "view_sales","manage_sales",
  "view_credentials","reveal_credential","manage_credentials",
  "manage_delegations","manage_access","manage_users","view_audit","export_data",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
