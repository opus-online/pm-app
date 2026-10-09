// Pure (no "server-only", no env reads) -- same precedent as lib/delegations.ts: this module is
// unit-tested directly (tests/mcp-jwt.test.ts), and "server-only" throws unconditionally under
// plain node/vitest (it only special-cases a Next.js client-bundle build), which would break
// that test. The secret is always an explicit param here, never read from process.env -- the
// only place that touches env/secrets is createUserScopedClient in ./user-client.ts, which does
// carry the "server-only" guard.
import { SignJWT } from "jose";
import { z } from "zod";

const DEFAULT_TTL_SECONDS = 300;
const MIN_TTL_SECONDS = 1;
const MAX_TTL_SECONDS = 300;

const uuidSchema = z.uuid();

/**
 * Mints a short-lived Supabase-compatible HS256 JWT identifying `userId`, signed with the
 * project's JWT secret. Spec: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md
 * (Identity). Claims are exactly `sub`, `role: 'authenticated'`, `aud: 'authenticated'`, `iat`,
 * `exp` -- nothing else -- so PostgREST/RLS treat the bearer exactly like a normal logged-in
 * user's session token, with no extra trust conferred.
 *
 * `userId` must be a uuid (this becomes `sub` -- a malformed subject would mint a token that
 * silently fails every `auth.uid()`-based check downstream instead of failing loudly here) and
 * `ttlSeconds` must fall within 1..300 (the design's "5-minute Supabase JWT" is a ceiling, not a
 * suggestion -- minting a longer-lived identity token defeats the point of re-minting per call).
 * Both are rejected by throwing rather than clamping/defaulting, since either one indicates a
 * caller bug, not a value worth silently coercing.
 */
export async function mintUserJwt(
  userId: string,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string> {
  if (!uuidSchema.safeParse(userId).success) {
    throw new Error("mintUserJwt: userId must be a uuid");
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds < MIN_TTL_SECONDS || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error(`mintUserJwt: ttlSeconds must be between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const key = new TextEncoder().encode(secret);

  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}
