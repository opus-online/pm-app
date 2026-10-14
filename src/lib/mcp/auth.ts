// Bearer authentication for the MCP endpoint: a `pmk_` access key, or a Supabase-issued OAuth
// access token (claude.ai connector). Pure (no "server-only", no env reads): both lookups are
// injected, so this module is unit-tested directly (tests/mcp-auth.test.ts). The real resolvers
// (service-role `mcp_resolve_key` / `mcp_resolve_connection`) are wired in ./server.ts.
// Specs: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md (Identity),
// docs/superpowers/specs/2026-10-14-claude-connector-oauth-design.md.
import { z } from "zod";
import { hashKey } from "@/lib/mcp/keys";
import { isOverRequestCeiling } from "@/lib/mcp/rate-limit";

/** A resolved credential. `keyId` is mcp_keys.id for keys, mcp_connections.id for OAuth
 * connections (also the rate-limit counter key). */
export type ResolvedCredential = { userId: string; keyId: string; canWrite: boolean };

/** `canWrite` false = read-only: only readOnly tools are exposed (see ./server.ts). The OAuth
 * token itself is deliberately not carried: /api/mcp re-mints its own short JWT for the user. */
export type McpAuth = ResolvedCredential & { kind: "key" | "oauth" };

/** Looks a key hash up; returns null when the key is unknown, revoked, expired or its user is not
 * active (mcp_resolve_key returns no row in all of those cases -- deliberately indistinguishable). */
export type KeyResolver = (keyHash: string) => Promise<ResolvedCredential | null>;

/** Verifies a Supabase OAuth access token and looks up its connection; null when the token is
 * invalid/expired, not an OAuth token, or the connection is gone. Throws on infrastructure errors. */
export type OAuthResolver = (token: string) => Promise<ResolvedCredential | null>;

/** `pmk_` + 32 random bytes base64url (43 chars, unpadded) -- see ./keys.ts generateKey. */
const KEY_PATTERN = /^pmk_[A-Za-z0-9_-]{43}$/;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type BearerCredential = { kind: "key"; key: string } | { kind: "oauth"; token: string };

/** Parses `Authorization: Bearer <pmk_ key | JWT>`. Returns null for a missing header, a
 * non-Bearer scheme, extra tokens, or a value shaped like neither (rejected before any lookup). */
export function extractBearerCredential(header: string | null): BearerCredential | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  if (!match) return null;
  const value = match[1];
  if (KEY_PATTERN.test(value)) return { kind: "key", key: value };
  if (JWT_PATTERN.test(value)) return { kind: "oauth", token: value };
  return null;
}

/** The `pmk_` key from the header, or null. */
export function extractBearerKey(header: string | null): string | null {
  const credential = extractBearerCredential(header);
  return credential?.kind === "key" ? credential.key : null;
}

const oauthClaims = z.object({ sub: z.uuid(), client_id: z.string().min(1), iat: z.number().int().positive() });

/** An OAuth access token carries `client_id`; a normal browser session token doesn't and is
 * refused here, so a stolen session cookie can't be replayed against /api/mcp. `issuedAt` lets
 * the resolver refuse tokens older than the current connection (disconnect + reconnect). */
export function oauthIdentity(claims: unknown): { userId: string; clientId: string; issuedAt: string } | null {
  const parsed = oauthClaims.safeParse(claims);
  return parsed.success
    ? { userId: parsed.data.sub, clientId: parsed.data.client_id, issuedAt: new Date(parsed.data.iat * 1000).toISOString() }
    : null;
}

export function jsonError(status: number, error: string, message: string, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/** 401 JSON. With `resourceMetadataUrl`, adds the RFC 9728 `WWW-Authenticate` challenge MCP
 * clients (claude.ai) use to discover the OAuth login. */
export function unauthorized(message: string, resourceMetadataUrl?: string): Response {
  return jsonError(
    401,
    "unauthorized",
    message,
    resourceMetadataUrl ? { "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"` } : undefined,
  );
}

/**
 * Authenticates an MCP request. Returns the credential's identity or a ready-to-send Response:
 * 401 JSON (with the OAuth challenge when `resourceMetadataUrl` is given) for a missing/malformed/
 * unknown/revoked/expired credential or a disabled/pending user, 503 JSON when the lookup itself
 * fails (fail closed -- never fall through to an anonymous call). A JWT is only accepted when an
 * OAuth resolver is configured.
 */
export async function authenticateRequest(
  req: Request,
  resolveKey: KeyResolver,
  opts: { resolveOAuth?: OAuthResolver; resourceMetadataUrl?: string } = {},
): Promise<McpAuth | Response> {
  const credential = extractBearerCredential(req.headers.get("authorization"));
  if (!credential || (credential.kind === "oauth" && !opts.resolveOAuth)) {
    return unauthorized("Missing or malformed access key. Send 'Authorization: Bearer <key>'.", opts.resourceMetadataUrl);
  }

  let resolved: ResolvedCredential | null;
  try {
    resolved = credential.kind === "key"
      ? await resolveKey(hashKey(credential.key))
      : await opts.resolveOAuth!(credential.token);
  } catch (err) {
    console.error("mcp credential resolve failed:", err instanceof Error ? err.message : err);
    return jsonError(503, "unavailable", "Could not verify the access key right now. Try again shortly.");
  }

  if (!resolved) {
    return unauthorized(
      credential.kind === "key"
        ? "Invalid or revoked key — create a new one in Settings → AI assistant."
        : "This connection is no longer valid — reconnect PM app in Claude.",
      opts.resourceMetadataUrl,
    );
  }
  return { ...resolved, kind: credential.kind };
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
