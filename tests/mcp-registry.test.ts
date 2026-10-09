import { describe, it, expect } from "vitest";
import { FORBIDDEN_NAME_PATTERN, TOOLS } from "@/lib/mcp/registry";

// Exact allowlist: adding, renaming or removing a tool must be a deliberate edit here.
const EXPECTED = [
  "whoami", "search", "list_projects", "get_project", "list_clients", "get_client",
  "list_people", "get_person", "get_workload", "list_time_entries", "get_budget",
  // Sales (Task 4)
  "sales_overview", "get_company", "my_next_steps",
  "log_activity", "plan_step", "complete_step", "update_step", "cancel_step", "move_entry_to_steps",
  "create_lead", "update_deal", "save_offer",
];

// Write tools planned in the spec (Tasks 4/5) -- must stay registrable under the guard.
const PLANNED_WRITE_NAMES = [
  "log_activity", "plan_step", "complete_step", "update_step", "cancel_step", "move_entry_to_steps",
  "create_lead", "update_deal", "save_offer", "post_status_update", "update_project", "log_time",
  "add_budget_item", "update_budget_item",
];

describe("MCP tool registry", () => {
  const names = TOOLS.map((t) => t.name);

  it("matches the exact tool allowlist", () => {
    expect([...names].sort()).toEqual([...EXPECTED].sort());
  });

  it("planned write tool names pass the forbidden-name guard", () => {
    expect(PLANNED_WRITE_NAMES.filter((n) => FORBIDDEN_NAME_PATTERN.test(n))).toEqual([]);
  });

  it("registers the read tools", () => {
    for (const name of [
      "whoami", "search", "list_projects", "get_project", "list_clients", "get_client",
      "list_people", "get_person", "get_workload", "list_time_entries", "get_budget",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("contains no delete/credential/admin/settings tool names", () => {
    const offending = names.filter((n) => FORBIDDEN_NAME_PATTERN.test(n));
    expect(offending).toEqual([]);
  });

  it("forbidden pattern catches the categories it must", () => {
    for (const bad of [
      "delete_project", "remove_member", "get_credentials", "reveal_secret", "reset_password",
      "set_user_role", "grant_access", "create_delegation", "user_admin", "update_settings",
      "set_permission", "grant_project", "revoke_key", "create_token", "invite_user", "purge_logs",
      "destroy_budget", "admin_stats", "impersonate_user", "create_api_key", "list_mcp_keys",
      "rotate_access_key",
    ]) {
      expect(FORBIDDEN_NAME_PATTERN.test(bad)).toBe(true);
    }
  });

  it("has unique, snake_case names with descriptions and object input schemas", () => {
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("rejects invalid input before touching the database", async () => {
    const getProject = TOOLS.find((t) => t.name === "get_project")!;
    // A ctx whose supabase throws on any access proves validation runs first.
    const ctx = {
      supabase: new Proxy({}, { get() { throw new Error("db touched"); } }),
      userId: "00000000-0000-0000-0000-000000000001",
      keyId: "00000000-0000-0000-0000-000000000002",
    } as never;
    await expect(getProject.run({ project_id: "not-a-uuid" }, ctx)).rejects.toThrow(/Invalid input/);
  });
});
