// Bearer-key authentication for the MCP endpoint. Pure (no "server-only", no env reads): the
// service-role key lookup is injected as `resolve`, so this module is unit-tested directly
// (tests/mcp-auth.test.ts). The real resolver (service-role `mcp_resolve_key` RPC) is wired in
// ./server.ts. Spec: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md (Identity).
import { hashKey } from "@/lib/mcp/keys";
import { isOverRequestCeiling } from "@/lib/mcp/rate-limit";

export type McpAuth = { userId: string; keyId: string };

/** Looks a key hash up; returns null when the key is unknown, revoked, expired or its user is not
 * active (mcp_resolve_key returns no row in all of those cases -- deliberately indistinguishable). */
export type KeyResolver = (keyHash: string) => Promise<McpAuth | null>;

/** `pmk_` + 32 random bytes base64url (43 chars, unpadded) -- see ./keys.ts generateKey. */
const KEY_PATTERN = /^pmk_[A-Za-z0-9_-]{43}$/;

/** Extracts the key from an `Authorization: Bearer <key>` header. Returns null for a missing
 * header, a non-Bearer scheme, extra tokens, or a value that isn't shaped like one of our keys
 * (rejected before any DB round trip). */
export function extractBearerKey(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  if (!match) return null;
  const key = match[1];
  return KEY_PATTERN.test(key) ? key : null;
}

export function jsonError(status: number, error: string, message: string, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/** 401 JSON only -- no `WWW-Authenticate` header. This endpoint isn't part of an HTTP Basic/Bearer
 * challenge-response flow or OAuth discovery (there's no such flow here, just a static API key),
 * so the header would be misleading overhead rather than a spec requirement. */
export function unauthorized(message: string): Response {
  return jsonError(401, "unauthorized", message);
}

/**
 * Authenticates an MCP request. Returns the key's `{ userId, keyId }` or a ready-to-send Response:
 * 401 JSON for a missing/malformed/unknown/revoked/expired key (or a disabled/pending user), 503
 * JSON when the lookup itself fails (fail closed -- never fall through to an anonymous call).
 */
export async function authenticateRequest(req: Request, resolve: KeyResolver): Promise<McpAuth | Response> {
  const key = extractBearerKey(req.headers.get("authorization"));
  if (!key) {
    return unauthorized("Missing or malformed access key. Send 'Authorization: Bearer <key>'.");
  }

  let resolved: McpAuth | null;
  try {
    resolved = await resolve(hashKey(key));
  } catch (err) {
    console.error("mcp key resolve failed:", err instanceof Error ? err.message : err);
    return jsonError(503, "unavailable", "Could not verify the access key right now. Try again shortly.");
  }

  if (!resolved) {
    return unauthorized("Invalid or revoked key — create a new one in Settings → AI assistant.");
  }
  return resolved;
}

/** Increments and returns this minute's authenticated-request count for the key. */
export type RequestBumper = (keyId: string) => Promise<number>;

/**
 * Per-key ceiling on every authenticated request (all MCP methods). Returns null when the request
 * may proceed, 429 JSON (Retry-After: 60) over the ceiling, or 503 JSON if the counter fails
 * (fail closed).
 */
export async function enforceRequestCeiling(auth: McpAuth, bump: RequestBumper): Promise<Response | null> {
  let requests: number;
  try {
    requests = await bump(auth.keyId);
  } catch (err) {
    console.error("mcp request counter failed:", err instanceof Error ? err.message : err);
    return jsonError(503, "unavailable", "Could not process the request right now. Try again shortly.");
  }
  if (isOverRequestCeiling(requests)) {
    return jsonError(429, "rate_limited", "Too many requests for this key, try again in a minute.", { "retry-after": "60" });
  }
  return null;
}
