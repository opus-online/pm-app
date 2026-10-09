import { describe, it, expect } from "vitest";
import { FORBIDDEN_NAME_PATTERN, TOOLS } from "@/lib/mcp/registry";

describe("MCP tool registry", () => {
  const names = TOOLS.map((t) => t.name);

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
