import { describe, it, expect, vi } from "vitest";
import { TOOLS } from "@/lib/mcp/registry";
import {
  NO_MANAGE_SALES, NO_VIEW_SALES, SALES_READ_TOOLS, SALES_WRITE_TOOLS, WRITE_NOTE, lostReasonFor, resolvePersonRef,
} from "@/lib/mcp/tools/sales";
import { ToolError } from "@/lib/mcp/types";
import {
  mapConvertEntryError, mapCreateLeadError, mapDealUpdateError, mapPlanStepInsertError, mapRound3RpcError, mapStepRpcError,
} from "@/lib/sales/rpc-errors";
import { prepareLeadInput } from "@/lib/sales/lead-input";
import { matchesCompanyQuery } from "@/lib/sales/list-filters";

const ME = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

/** A ctx whose DB is untouchable: proves validation runs before any query. */
const untouchableCtx = () => ({
  supabase: new Proxy({}, { get() { throw new Error("db touched"); } }),
  userId: ME,
  keyId: KEY,
  audit: vi.fn(),
}) as never;

/** A ctx whose only answer is has_permission = `allowed`; any other DB access throws. */
function permissionCtx(allowed: boolean) {
  const audit = vi.fn();
  const rpc = vi.fn(async (fn: string) => {
    if (fn !== "has_permission") throw new Error(`unexpected rpc ${fn}`);
    return { data: allowed, error: null };
  });
  const supabase = { rpc, from: () => { throw new Error("table touched"); } };
  return { ctx: { supabase, userId: ME, keyId: KEY, audit } as never, rpc, audit };
}

describe("check(): PGRST301 (rejected JWT) gets its own message", () => {
  it("update_deal maps a PGRST301 read error to the server-misconfiguration message", async () => {
    const audit = vi.fn();
    const rpc = vi.fn(async (fn: string) => {
      if (fn !== "has_permission") throw new Error(`unexpected rpc ${fn}`);
      return { data: true, error: null };
    });
    const from = (table: string) => {
      if (table !== "deals") throw new Error(`unexpected table ${table}`);
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: () => Promise.resolve({ data: null, error: { code: "PGRST301", message: "JWT expired" } }),
      };
      return b;
    };
    const ctx = { supabase: { rpc, from }, userId: ME, keyId: KEY, audit } as never;
    await expect(
      tool("update_deal").run({ deal_id: ID, lost_reason: "Budget" }, ctx)
    ).rejects.toThrow("Server misconfiguration (token rejected) — contact an admin.");
  });
});

describe("sales tool definitions", () => {
  it("write tools say they change data and are not read-only", () => {
    for (const t of SALES_WRITE_TOOLS) {
      expect(t.description.startsWith(WRITE_NOTE)).toBe(true);
      expect(t.readOnly).toBe(false);
    }
    for (const t of SALES_READ_TOOLS) {
      expect(t.readOnly).toBe(true);
      expect(t.description).not.toContain(WRITE_NOTE);
    }
  });
});

describe("sales tool input schemas", () => {
  const bad: [string, Record<string, unknown>, RegExp][] = [
    ["get_company", { company_id: "x" }, /company_id/],
    ["sales_overview", { due_from: "01.10.2026" }, /YYYY-MM-DD/],
    ["log_activity", { company_id: ID, kind: "system", body: "x" }, /kind/],
    ["log_activity", { company_id: ID, kind: "call", body: "  " }, /body/],
    ["plan_step", { company_id: ID, kind: "call", body: "Call", due_on: "tomorrow" }, /due_on/],
    ["complete_step", { activity_id: "nope" }, /activity_id/],
    ["update_step", { activity_id: ID, due_on: "2026-13" }, /due_on/],
    ["cancel_step", { activity_id: ID, reason: "x".repeat(501) }, /reason/],
    ["move_entry_to_steps", { activity_id: ID }, /due_on/],
    ["create_lead", { deal: { title: "X", source: "cold" } }, /source/],
    ["update_deal", { deal_id: ID, stage: "closed" }, /stage/],
    ["save_offer", { deal_id: ID, amount: -1 }, /amount/],
  ];
  it.each(bad)("%s rejects %j before touching the DB", async (name, args, re) => {
    const err = await tool(name).run(args, untouchableCtx()).catch((e) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect(err.message).toMatch(/^Invalid input\./);
    expect(err.message).toMatch(re);
  });

  it("accepts minimal valid input shapes", () => {
    const ok: [string, Record<string, unknown>][] = [
      ["sales_overview", {}],
      ["sales_overview", { responsible: "me", search: "nordic", due_from: "2026-10-01", due_to: "2026-10-31" }],
      ["my_next_steps", {}],
      ["plan_step", { company_id: ID, kind: "call", body: "Call back", due_on: "2026-10-12" }],
      ["complete_step", { activity_id: ID, comment: "Done" }],
      ["update_step", { activity_id: ID, deal_id: null }],
      ["create_lead", { company: { name: "Acme" }, deal: { title: "Site", source: "inbound" }, step: { body: "Call", due_on: "2026-10-12" } }],
      ["update_deal", { deal_id: ID, stage: "lost" }],
      ["save_offer", { deal_id: ID, title: "Offer", amount: 1000 }],
    ];
    for (const [name, args] of ok) expect(tool(name).inputSchema.safeParse(args).success, name).toBe(true);
  });
});

describe("sales permission gate", () => {
  const writeArgs: Record<string, Record<string, unknown>> = {
    log_activity: { company_id: ID, kind: "note", body: "x" },
    plan_step: { company_id: ID, kind: "call", body: "x", due_on: "2026-10-12" },
    complete_step: { activity_id: ID },
    update_step: { activity_id: ID, body: "x" },
    cancel_step: { activity_id: ID },
    move_entry_to_steps: { activity_id: ID, due_on: "2026-10-12" },
    create_lead: { company: { name: "Acme" }, deal: { title: "X", source: "inbound" } },
    update_deal: { deal_id: ID, title: "X" },
    save_offer: { deal_id: ID, title: "X", amount: 1 },
  };

  it.each(SALES_WRITE_TOOLS.map((t) => t.name))("%s refuses without manage_sales and writes nothing", async (name) => {
    const { ctx, rpc, audit } = permissionCtx(false);
    const err = await tool(name).run(writeArgs[name], ctx).catch((e) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect(err.message).toBe(NO_MANAGE_SALES);
    expect(rpc).toHaveBeenCalledWith("has_permission", { uid: ME, perm: "manage_sales" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
  });

  it.each(["sales_overview", "get_company", "my_next_steps"])("%s refuses without view_sales", async (name) => {
    const { ctx } = permissionCtx(false);
    const args = name === "get_company" ? { company_id: ID } : {};
    await expect(tool(name).run(args, ctx)).rejects.toThrow(NO_VIEW_SALES);
  });

  it("update_deal to lost without a reason is a friendly error, nothing written", async () => {
    const { ctx, audit } = permissionCtx(true);
    const err = await tool("update_deal").run({ deal_id: ID, stage: "lost" }, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect(err.message).toMatch(/lost deal needs a reason/);
    expect(audit).not.toHaveBeenCalled();
  });

  it("update_deal with nothing to change is refused", async () => {
    const { ctx } = permissionCtx(true);
    await expect(tool("update_deal").run({ deal_id: ID }, ctx)).rejects.toThrow(/Nothing to change/);
  });

  it("create_lead needs a company", async () => {
    const { ctx } = permissionCtx(true);
    await expect(tool("create_lead").run({ deal: { title: "X", source: "inbound" } }, ctx)).rejects.toThrow(/company_id/);
  });
});

describe("person references", () => {
  const people = [
    { id: ME, name: "Sara Müük", assignable: true },
    { id: "b", name: "Sam Seller", assignable: true },
    { id: "c", name: "Samuel Other", assignable: true },
    { id: ID, name: "Bella Pm", assignable: false },
    { id: "e", name: "Sam Twin", assignable: true },
  ];
  it("resolves me, assignable ids, exact full names and unique first names (case-insensitive)", () => {
    expect(resolvePersonRef("me", ME, people)).toBe(ME);
    expect(resolvePersonRef(ME, ME, people)).toBe(ME);
    expect(resolvePersonRef("sam seller", ME, people)).toBe("b");
    expect(resolvePersonRef("SARA", ME, people)).toBe(ME);
    expect(resolvePersonRef("samuel", ME, people)).toBe("c");
  });
  it("never silently picks a partial match", () => {
    expect(() => resolvePersonRef("sar", ME, people)).toThrow(/No assignable Sales person is named "sar".*Did you mean: Sara Müük/);
    expect(() => resolvePersonRef("Seller", ME, people)).toThrow(/Did you mean: Sam Seller/);
  });
  it("lists candidates when a first name is ambiguous", () => {
    expect(() => resolvePersonRef("sam", ME, people)).toThrow(/several people: Sam Seller, Sam Twin/);
  });
  it("only matches assignable people for assignee/done_by/owner", () => {
    expect(() => resolvePersonRef("Bella Pm", ME, people)).toThrow(/No assignable Sales person/);
    expect(() => resolvePersonRef(ID, ME, people)).toThrow(/doesn't have Sales access/);
    expect(() => resolvePersonRef("me", ID, people)).toThrow(/You don't have Sales access/);
  });
  it("the responsible filter (assignableOnly false) may name anyone, still exact only", () => {
    expect(resolvePersonRef("bella pm", ME, people, { assignableOnly: false })).toBe(ID);
    expect(resolvePersonRef(ID, ME, [], { assignableOnly: false })).toBe(ID);
    expect(() => resolvePersonRef("bel", ME, people, { assignableOnly: false })).toThrow(/No Sales person is named/);
  });
});

describe("deal lost-reason rule", () => {
  it("moving to any non-lost stage clears the reason", () => {
    expect(lostReasonFor("negotiation", undefined, null)).toBeNull();
    expect(lostReasonFor("won", "", null)).toBeNull();
  });
  it("rejects a reason passed with a non-lost stage", () => {
    expect(() => lostReasonFor("negotiation", "Budget", null)).toThrow(/only applies to a lost deal/);
  });
  it("lost needs a reason", () => {
    expect(() => lostReasonFor("lost", undefined, null)).toThrow(/needs a reason/);
    expect(() => lostReasonFor("lost", "  ", null)).toThrow(/needs a reason/);
    expect(lostReasonFor("lost", " Budget ", "negotiation")).toBe("Budget");
  });
  it("a reason alone only changes on a deal that is already lost, and can't be blanked", () => {
    expect(lostReasonFor(undefined, "New reason", "lost")).toBe("New reason");
    expect(() => lostReasonFor(undefined, "x", "negotiation")).toThrow(/isn't lost/);
    expect(() => lostReasonFor(undefined, "", "lost")).toThrow(/needs a reason/);
  });
  it("no stage and no reason leaves the column alone", () => {
    expect(lostReasonFor(undefined, undefined, null)).toBeUndefined();
  });
});

describe("save_offer create", () => {
  it.each([
    [{ title: "Offer" }, "Amount is required for a new offer."],
    [{ amount: 100 }, "Title is required for a new offer."],
  ])("%j is refused before any write", async (fields, message) => {
    const { ctx, audit } = permissionCtx(true);
    await expect(tool("save_offer").run({ deal_id: ID, ...fields }, ctx)).rejects.toThrow(message);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("sales error mapping (shared with the app actions)", () => {
  const e = (code: string, message = "raw pg text") => ({ code, message });
  it("never surfaces raw DB text", () => {
    for (const msg of [
      mapStepRpcError(e("XX000"), "d"), mapRound3RpcError(e("XX000"), "n"), mapConvertEntryError(e("XX000")),
      mapPlanStepInsertError(e("XX000")), mapCreateLeadError(e("XX000")), mapDealUpdateError(e("XX000")),
    ]) expect(msg).not.toContain("raw pg text");
  });
  it("splits 42501 into not-authorized vs assignee without Sales", () => {
    expect(mapStepRpcError(e("42501", "Not authorized"), "d")).toBe("Not authorized");
    expect(mapStepRpcError(e("42501", "Assignee must be a Sales user"), "d")).toBe("That person doesn't have Sales access.");
    expect(mapRound3RpcError(e("42501", "done_by must be a Sales user"), "n")).toBe("That person doesn't have Sales access.");
  });
  it("maps step codes", () => {
    expect(mapStepRpcError(e("P0002"), "d")).toBe("This step is already done or was removed.");
    expect(mapStepRpcError(e("22004"), "Pick a date.")).toBe("Pick a date.");
    expect(mapRound3RpcError(e("P0002"), "Gone.")).toBe("Gone.");
    expect(mapRound3RpcError(e("22023"), "n")).toMatch(/another company or is closed/);
    expect(mapConvertEntryError(e("22023"))).toMatch(/closed deal/);
    expect(mapConvertEntryError(e("P0002"))).toMatch(/can't be moved/);
    expect(mapPlanStepInsertError(e("42501"))).toBe("That person doesn't have Sales access.");
    expect(mapPlanStepInsertError(null)).toBe("Save failed. Try again.");
  });
  it("maps lead and deal codes", () => {
    expect(mapCreateLeadError(e("23505"))).toMatch(/registry code already exists/);
    expect(mapCreateLeadError(e("P0001"))).toBe("Could not create the lead. Try again.");
    expect(mapDealUpdateError(e("23514"))).toBe("Give a reason for losing the deal.");
  });
});

describe("shared lead/list helpers", () => {
  it("prepareLeadInput drops company fields for an existing company and defaults the step assignee", () => {
    const input = {
      client_id: ID,
      company: { name: "stale" },
      deal: { title: "X", source: "inbound" as const, owner_id: ME },
      step: { body: "Call", due_on: "2026-10-12" },
    };
    const out = prepareLeadInput(input);
    expect(out.company).toBeUndefined();
    expect(out.step?.assignee_id).toBe(ME);
    expect(input.company).toEqual({ name: "stale" }); // caller's object untouched
    expect((input.step as Record<string, unknown>).assignee_id).toBeUndefined();
  });
  it("matchesCompanyQuery searches name, reg code, step text and contacts", () => {
    const row = {
      name: "Nordic Timber", reg_code: "10 123 456", next_step: { body: "Send pricing" },
      contacts: [{ name: "Mari Mets", email: "mari@nt.ee", phone: "+372 5555 1234" }],
    };
    for (const q of ["nordic", "10123", "pricing", "mari", "nt.ee", "5551"]) expect(matchesCompanyQuery(row, q), q).toBe(true);
    expect(matchesCompanyQuery(row, "acme")).toBe(false);
  });
});
