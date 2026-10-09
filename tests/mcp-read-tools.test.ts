import { describe, it, expect, vi } from "vitest";
import { TOOLS } from "@/lib/mcp/registry";

const ME = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

describe("check(): PGRST301 (rejected JWT) gets its own message", () => {
  it("get_project maps a PGRST301 read error to the server-misconfiguration message", async () => {
    const audit = vi.fn();
    const from = (table: string) => {
      if (table !== "projects") throw new Error(`unexpected table ${table}`);
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: () => Promise.resolve({ data: null, error: { code: "PGRST301", message: "JWT expired" } }),
      };
      return b;
    };
    const ctx = { supabase: { from }, userId: ME, keyId: KEY, audit } as never;
    await expect(tool("get_project").run({ project_id: ID }, ctx)).rejects.toThrow(
      "Server misconfiguration (token rejected) — contact an admin."
    );
  });
});
