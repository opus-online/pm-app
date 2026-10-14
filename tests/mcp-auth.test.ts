import { describe, it, expect, vi } from "vitest";
import {
  authenticateRequest, enforceRequestCeiling, extractBearerCredential, extractBearerKey, oauthIdentity,
} from "@/lib/mcp/auth";
import { generateKey, hashKey } from "@/lib/mcp/keys";
import { RATE_LIMIT_PER_MINUTE, REQUEST_CEILING_PER_MINUTE, isOverRequestCeiling, isRateLimited } from "@/lib/mcp/rate-limit";

const ids = { userId: "11111111-1111-4111-8111-111111111111", keyId: "22222222-2222-4222-8222-222222222222", canWrite: true };

function req(authorization?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("http://localhost/api/mcp", { method: "POST", headers, body: "{}" });
}

describe("extractBearerKey", () => {
  const { key } = generateKey();

  it("accepts a well-formed Bearer key (scheme case-insensitive)", () => {
    expect(extractBearerKey(`Bearer ${key}`)).toBe(key);
    expect(extractBearerKey(`bearer ${key}`)).toBe(key);
  });

  it("rejects missing, non-Bearer, extra-token and malformed values", () => {
    expect(extractBearerKey(null)).toBeNull();
    expect(extractBearerKey("")).toBeNull();
    expect(extractBearerKey(`Basic ${key}`)).toBeNull();
    expect(extractBearerKey(key)).toBeNull();
    expect(extractBearerKey(`Bearer ${key} extra`)).toBeNull();
    expect(extractBearerKey("Bearer pmk_short")).toBeNull();
    expect(extractBearerKey(`Bearer xyz_${key.slice(4)}`)).toBeNull();
    expect(extractBearerKey(`Bearer ${key}=`)).toBeNull();
  });
});

describe("authenticateRequest", () => {
  it("401 JSON without calling the resolver when the header is missing", async () => {
    const resolve = vi.fn();
    const res = await authenticateRequest(req(), resolve);
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(401);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect((await r.json()).error).toBe("unauthorized");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("401 without calling the resolver for a malformed header", async () => {
    const resolve = vi.fn();
    const res = await authenticateRequest(req("Bearer nope"), resolve);
    expect((res as Response).status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("401 when the key does not resolve (unknown/revoked/expired/inactive)", async () => {
    const { key } = generateKey();
    const resolve = vi.fn().mockResolvedValue(null);
    const res = await authenticateRequest(req(`Bearer ${key}`), resolve);
    expect((res as Response).status).toBe(401);
  });

  it("looks the key up by its sha256 hash only, and returns the resolved identity", async () => {
    const { key } = generateKey();
    const resolve = vi.fn().mockResolvedValue(ids);
    const res = await authenticateRequest(req(`Bearer ${key}`), resolve);
    expect(res).toEqual({ ...ids, kind: "key" });
    expect(resolve).toHaveBeenCalledWith(hashKey(key));
    expect(resolve.mock.calls[0][0]).not.toContain(key);
  });

  it("fails closed with 503 when the resolver throws", async () => {
    const { key } = generateKey();
    const resolve = vi.fn().mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await authenticateRequest(req(`Bearer ${key}`), resolve);
    spy.mockRestore();
    expect((res as Response).status).toBe(503);
  });
});

describe("isRateLimited", () => {
  it("allows up to 60 calls per minute and refuses call 61", () => {
    expect(RATE_LIMIT_PER_MINUTE).toBe(60);
    expect(isRateLimited(1)).toBe(false);
    expect(isRateLimited(60)).toBe(false);
    expect(isRateLimited(61)).toBe(true);
    expect(isRateLimited(1000)).toBe(true);
  });

  it("fails closed on a non-finite count", () => {
    expect(isRateLimited(Number.NaN)).toBe(true);
    expect(isRateLimited(Number.POSITIVE_INFINITY)).toBe(true);
  });
});

describe("runTool rate limiting", async () => {
  const { runTool } = await import("@/lib/mcp/run-tool");
  const { ToolError } = await import("@/lib/mcp/types");
  const ctx = { supabase: {} as never, audit: async () => {}, via: "key" as const, ...ids };
  const makeTool = (impl: () => Promise<string>) => ({
    name: "t", title: "t", description: "test tool", readOnly: true,
    inputSchema: {} as never, run: vi.fn(impl),
  });

  it("runs the tool on call 60", async () => {
    const tool = makeTool(async () => "ok");
    const res = await runTool(tool, {}, ctx, async () => 60);
    expect(res).toEqual({ content: [{ type: "text", text: "ok" }] });
    expect(tool.run).toHaveBeenCalledOnce();
  });

  it("refuses call 61 with the rate-limit error and never invokes the tool", async () => {
    const tool = makeTool(async () => "ok");
    const bump = vi.fn().mockResolvedValue(61);
    const res = await runTool(tool, {}, ctx, bump);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Rate limit reached/);
    expect(bump).toHaveBeenCalledWith(ids.keyId);
    expect(tool.run).not.toHaveBeenCalled();
  });

  it("fails closed (tool not run) when the usage counter errors", async () => {
    const tool = makeTool(async () => "ok");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runTool(tool, {}, ctx, async () => { throw new Error("db"); });
    spy.mockRestore();
    expect(res.isError).toBe(true);
    expect(tool.run).not.toHaveBeenCalled();
  });

  it("passes ToolError text through but hides raw errors", async () => {
    const friendly = await runTool(makeTool(async () => { throw new ToolError("Project not found."); }), {}, ctx, async () => 1);
    expect(friendly.content[0].text).toBe("Project not found.");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = await runTool(makeTool(async () => { throw new Error('relation "x" violates rls'); }), {}, ctx, async () => 1);
    spy.mockRestore();
    expect(raw.isError).toBe(true);
    expect(raw.content[0].text).not.toMatch(/relation|rls/);
  });
});

describe("read-only keys", async () => {
  const { runTool, READ_ONLY_KEY_MESSAGE } = await import("@/lib/mcp/run-tool");
  const { TOOLS, toolsForKey } = await import("@/lib/mcp/registry");
  const { mcpInstructions } = await import("@/lib/mcp/instructions");
  const readOnlyCtx = { supabase: {} as never, audit: async () => {}, via: "key" as const, ...ids, canWrite: false };

  it("get only the read tools; write keys get every tool", () => {
    const visible = toolsForKey(false);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((t) => t.readOnly)).toBe(true);
    expect(visible).toEqual(TOOLS.filter((t) => t.readOnly));
    expect(toolsForKey(true)).toEqual(TOOLS);
  });

  it("can't run a write tool even if one is reached (not counted, never invoked)", async () => {
    const tool = { name: "w", title: "w", description: "write tool", readOnly: false, inputSchema: {} as never, run: vi.fn() };
    const bump = vi.fn().mockResolvedValue(1);
    const res = await runTool(tool, {}, readOnlyCtx, bump);
    expect(res).toEqual({ content: [{ type: "text", text: READ_ONLY_KEY_MESSAGE }], isError: true });
    expect(tool.run).not.toHaveBeenCalled();
    expect(bump).not.toHaveBeenCalled();
  });

  it("still run read tools", async () => {
    const tool = { name: "r", title: "r", description: "read tool", readOnly: true, inputSchema: {} as never, run: vi.fn(async () => "ok") };
    const res = await runTool(tool, {}, readOnlyCtx, async () => 1);
    expect(res.content[0].text).toBe("ok");
  });

  it("are told they are read-only in the server instructions", () => {
    expect(mcpInstructions(false)).toMatch(/READ-ONLY/);
    expect(mcpInstructions(true)).not.toMatch(/READ-ONLY/);
  });
});

describe("request ceiling (all methods)", () => {
  it("allows up to 300 requests per minute and refuses request 301", () => {
    expect(REQUEST_CEILING_PER_MINUTE).toBe(300);
    expect(isOverRequestCeiling(300)).toBe(false);
    expect(isOverRequestCeiling(301)).toBe(true);
    expect(isOverRequestCeiling(Number.NaN)).toBe(true);
  });

  it("enforceRequestCeiling: null under the ceiling, bumping the key's counter", async () => {
    const bump = vi.fn().mockResolvedValue(300);
    expect(await enforceRequestCeiling({ ...ids, kind: "key" }, bump)).toBeNull();
    expect(bump).toHaveBeenCalledWith(ids.keyId);
  });

  it("enforceRequestCeiling: HTTP 429 JSON with Retry-After over the ceiling", async () => {
    const res = (await enforceRequestCeiling({ ...ids, kind: "key" }, async () => 301))!;
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("retry-after")).toBe("60");
    expect((await res.json()).error).toBe("rate_limited");
  });

  it("enforceRequestCeiling: fails closed with 503 when the counter errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = (await enforceRequestCeiling({ ...ids, kind: "key" }, async () => { throw new Error("db"); }))!;
    spy.mockRestore();
    expect(res.status).toBe(503);
  });
});

describe("OAuth credentials", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln";

  it("tells keys and JWTs apart and rejects junk", () => {
    const { key } = generateKey();
    expect(extractBearerCredential(`Bearer ${key}`)).toEqual({ kind: "key", key });
    expect(extractBearerCredential(`Bearer ${jwt}`)).toEqual({ kind: "oauth", token: jwt });
    expect(extractBearerCredential("Bearer nope")).toBeNull();
    expect(extractBearerCredential("Basic abc")).toBeNull();
    expect(extractBearerCredential(null)).toBeNull();
  });

  it("requires a client_id claim (browser session tokens are not connections)", () => {
    const sub = "11111111-1111-4111-8111-111111111111";
    expect(oauthIdentity({ sub, client_id: "c1", iat: 1760443200 })).toEqual({
      userId: sub, clientId: "c1", issuedAt: "2025-10-14T12:00:00.000Z",
    });
    expect(oauthIdentity({ sub, iat: 1760443200 })).toBeNull();
    expect(oauthIdentity({ sub, client_id: "", iat: 1760443200 })).toBeNull();
    expect(oauthIdentity({ sub: "not-a-uuid", client_id: "c1", iat: 1760443200 })).toBeNull();
    // review Important #1: without iat a token can't be tied to the connection it was issued for
    expect(oauthIdentity({ sub, client_id: "c1" })).toBeNull();
    expect(oauthIdentity(null)).toBeNull();
  });

  it("resolves a JWT through the OAuth resolver and keeps the token", async () => {
    const resolveKey = vi.fn();
    const resolveOAuth = vi.fn().mockResolvedValue({ ...ids, canWrite: false });
    const res = await authenticateRequest(req(`Bearer ${jwt}`), resolveKey, { resolveOAuth });
    // review Critical #2: the raw token is never carried on -- /api/mcp re-mints its own JWT
    expect(res).toEqual({ ...ids, canWrite: false, kind: "oauth" });
    expect(resolveOAuth).toHaveBeenCalledWith(jwt);
    expect(resolveKey).not.toHaveBeenCalled();
  });

  it("401 with a WWW-Authenticate challenge when the OAuth token doesn't resolve (e.g. disconnected)", async () => {
    const res = await authenticateRequest(req(`Bearer ${jwt}`), vi.fn(), {
      resolveOAuth: vi.fn().mockResolvedValue(null),
      resourceMetadataUrl: "https://pm.example.com/.well-known/oauth-protected-resource/api/mcp",
    });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
    expect((res as Response).headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://pm.example.com/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it("401 challenge also when no header is sent", async () => {
    const res = (await authenticateRequest(req(), vi.fn(), { resourceMetadataUrl: "https://x/m" })) as Response;
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer resource_metadata="https://x/m"');
  });

  it("JWT without an OAuth resolver configured is a 401, never a pass-through", async () => {
    const res = (await authenticateRequest(req(`Bearer ${jwt}`), vi.fn())) as Response;
    expect(res.status).toBe(401);
  });

  it("503 when the OAuth resolver throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = (await authenticateRequest(req(`Bearer ${jwt}`), vi.fn(), {
      resolveOAuth: vi.fn().mockRejectedValue(new Error("auth down")),
    })) as Response;
    spy.mockRestore();
    expect(res.status).toBe(503);
  });
});
