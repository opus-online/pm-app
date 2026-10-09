import { describe, it, expect, vi } from "vitest";
import { TOOLS } from "@/lib/mcp/registry";
import {
  NO_EDIT_PROJECT, NO_EDIT_STATUS, NO_INTERNAL_COST, NO_LOG_TIME, NO_MANAGE_BUDGET, PROJECT_WRITE_TOOLS,
  UPDATABLE_PROJECT_FIELDS, buildProjectPatch,
} from "@/lib/mcp/tools/projects";
import { WRITE_NOTE } from "@/lib/mcp/tools/sales";
import { replaceVisibleTags } from "@/lib/project-icons";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ME = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

const untouchableCtx = () => ({
  supabase: new Proxy({}, { get() { throw new Error("db touched"); } }),
  userId: ME,
  keyId: KEY,
  audit: vi.fn(),
}) as never;

/** has_permission answers per permission key; any table access throws. */
function permissionCtx(allowed: Record<string, boolean> | boolean) {
  const audit = vi.fn();
  const rpc = vi.fn(async (fn: string, args: { perm: string }) => {
    if (fn !== "has_permission") throw new Error(`unexpected rpc ${fn}`);
    return { data: typeof allowed === "boolean" ? allowed : (allowed[args.perm] ?? false), error: null };
  });
  const supabase = { rpc, from: () => { throw new Error("table touched"); } };
  return { ctx: { supabase, userId: ME, keyId: KEY, audit } as never, rpc, audit };
}

describe("project tool definitions", () => {
  it("are the five registered write tools, each marked as changing data", () => {
    expect(PROJECT_WRITE_TOOLS.map((t) => t.name).sort()).toEqual(
      ["add_budget_item", "log_time", "post_status_update", "update_budget_item", "update_project"]
    );
    for (const t of PROJECT_WRITE_TOOLS) {
      expect(TOOLS).toContain(t);
      expect(t.readOnly).toBe(false);
      expect(t.description.startsWith(WRITE_NOTE)).toBe(true);
    }
  });
});

describe("project tool input schemas", () => {
  const bad: [string, Record<string, unknown>, RegExp][] = [
    ["post_status_update", { project_id: "x", completed: "Done" }, /project_id/],
    ["post_status_update", { project_id: ID, completed: "x".repeat(4001) }, /completed/],
    ["update_project", { project_id: ID, status: "done" }, /status/],
    ["update_project", { project_id: ID, deadline: "31.12.2026" }, /deadline/],
    ["update_project", { project_id: ID, name: "  " }, /name/],
    ["update_project", { project_id: ID, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }, /tags/],
    ["log_time", { project_id: ID, month: "2026-13", hours: 10 }, /month/],
    ["log_time", { project_id: ID, month: "2026-10-01", hours: 10 }, /month/],
    ["log_time", { project_id: ID, month: "2026-10" }, /hours/],
    ["add_budget_item", { project_id: ID, item_type: "refund", name: "X", amount: 1, occurred_on: "2026-10-01" }, /item_type/],
    ["add_budget_item", { project_id: ID, item_type: "invoice", name: "X", amount: 1, occurred_on: "01.10.2026" }, /occurred_on/],
    ["update_budget_item", { item_id: 0, name: "X" }, /item_id/],
    ["update_budget_item", { item_id: "abc", name: "X" }, /item_id/],
  ];
  it.each(bad)("%s rejects %j before touching the database", async (name, args, re) => {
    await expect(tool(name).run(args, untouchableCtx())).rejects.toThrow(re);
  });

  it("update_project rejects fields outside the allowlist", async () => {
    for (const field of ["pm_id", "client_id", "health", "progress", "budget_type", "internal_notes"]) {
      await expect(tool("update_project").run({ project_id: ID, [field]: "x" }, untouchableCtx())).rejects.toThrow(/Invalid input/);
    }
  });

  it("update_budget_item can't change the item type", async () => {
    await expect(tool("update_budget_item").run({ item_id: 5, item_type: "invoice" }, untouchableCtx())).rejects.toThrow(/Invalid input/);
  });

  it("update_project / update_budget_item need at least one field", async () => {
    await expect(tool("update_project").run({ project_id: ID }, untouchableCtx())).rejects.toThrow(/at least one field/);
    await expect(tool("update_budget_item").run({ item_id: 5 }, untouchableCtx())).rejects.toThrow(/at least one field/);
  });
});

describe("update_project field allowlist", () => {
  it("is exactly the spec's fields", () => {
    expect([...UPDATABLE_PROJECT_FIELDS].sort()).toEqual(["deadline", "description", "name", "start_date", "status", "tags"]);
  });

  it("only writes provided allowlisted fields, validated by the app schema", () => {
    const patch = buildProjectPatch(
      { deadline: "2026-12-31", description: "  New scope  ", pm_id: ME, health: "critical", progress: 100, client_id: ID },
      ["_icon:globe"]
    );
    expect(patch).toEqual({ deadline: "2026-12-31", description: "New scope" });
  });

  it("collapses blank description to null and passes explicit null dates", () => {
    expect(buildProjectPatch({ description: "  ", start_date: null }, null)).toEqual({ description: null, start_date: null });
  });

  it("keeps the hidden icon tag when replacing tags", () => {
    expect(buildProjectPatch({ tags: ["web", "eu"] }, ["old", "_icon:globe"])).toEqual({ tags: ["web", "eu", "_icon:globe"] });
    expect(buildProjectPatch({ tags: [] }, ["old", "_icon:code"])).toEqual({ tags: ["_icon:code"] });
  });

  it("never invents or forges an icon tag", () => {
    expect(replaceVisibleTags(["a"], ["b"])).toEqual(["b"]);
    expect(replaceVisibleTags(["_icon:star"], ["b", "_icon:wrench"])).toEqual(["b", "_icon:star"]);
  });
});

describe("project tool permission gates", () => {
  it("update_project refuses without edit_project, before any table access", async () => {
    const { ctx, rpc, audit } = permissionCtx(false);
    await expect(tool("update_project").run({ project_id: ID, deadline: "2026-12-31" }, ctx)).rejects.toThrow(NO_EDIT_PROJECT);
    expect(rpc).toHaveBeenCalledWith("has_permission", { uid: ME, perm: "edit_project", project: ID });
    expect(audit).not.toHaveBeenCalled();
  });

  it("post_status_update refuses without edit_status", async () => {
    const { ctx, rpc } = permissionCtx(false);
    await expect(tool("post_status_update").run({ project_id: ID, completed: "Done" }, ctx)).rejects.toThrow(NO_EDIT_STATUS);
    expect(rpc).toHaveBeenCalledWith("has_permission", { uid: ME, perm: "edit_status", project: ID });
  });

  it("post_status_update needs at least one section", async () => {
    const { ctx } = permissionCtx(true);
    await expect(tool("post_status_update").run({ project_id: ID, completed: "   " }, ctx)).rejects.toThrow(/at least one field/);
  });

  it("log_time refuses without log_time (global check)", async () => {
    const { ctx, rpc } = permissionCtx(false);
    await expect(tool("log_time").run({ project_id: ID, month: "2026-10", hours: 10 }, ctx)).rejects.toThrow(NO_LOG_TIME);
    expect(rpc).toHaveBeenCalledWith("has_permission", { uid: ME, perm: "log_time" });
  });

  it("log_time applies the app's hour bounds", async () => {
    const { ctx } = permissionCtx(true);
    await expect(tool("log_time").run({ project_id: ID, month: "2026-10", hours: 0 }, ctx)).rejects.toThrow(/greater than 0/);
    await expect(tool("log_time").run({ project_id: ID, month: "2026-10", hours: 745 }, ctx)).rejects.toThrow(/more hours than a month/);
  });

  it("add_budget_item refuses without manage_budget", async () => {
    const { ctx } = permissionCtx(false);
    await expect(
      tool("add_budget_item").run({ project_id: ID, item_type: "invoice", name: "Inv 1", amount: 100, occurred_on: "2026-10-01" }, ctx)
    ).rejects.toThrow(NO_MANAGE_BUDGET);
  });

  it("add_budget_item cost types need view_internal_cost too (PM can't)", async () => {
    const { ctx, audit } = permissionCtx({ manage_budget: true, view_internal_cost: false });
    await expect(
      tool("add_budget_item").run({ project_id: ID, item_type: "actual_cost", name: "Hosting", amount: 100, occurred_on: "2026-10-01" }, ctx)
    ).rejects.toThrow(NO_INTERNAL_COST);
    expect(audit).not.toHaveBeenCalled();
  });
});
