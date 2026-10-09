// No top-level "server-only" import here (unlike admin.ts/session.ts) -- same reasoning as
// lib/delegations.ts: mintUserJwt is pure (the secret is an explicit param, never read from
// env inside it) and tests/mcp-jwt.test.ts imports it directly, which "server-only" would
// break under plain node/vitest (it throws unconditionally outside a Next.js client-bundle
// check). createUserScopedClient below is the only part that touches env/secrets, and it is
// only ever called from server actions.
import { SignJWT } from "jose";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const DEFAULT_TTL_SECONDS = 300;

/**
 * Mints a short-lived Supabase-compatible HS256 JWT identifying `userId`, signed with the
 * project's JWT secret. Spec: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md
 * (Identity). Claims are exactly `sub`, `role: 'authenticated'`, `aud: 'authenticated'`, `iat`,
 * `exp` -- nothing else -- so PostgREST/RLS treat the bearer exactly like a normal logged-in
 * user's session token, with no extra trust conferred.
 */
export async function mintUserJwt(
  userId: string,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string> {
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

/**
 * A supabase-js client acting as `userId`: anon key + `Authorization: Bearer <minted JWT>`.
 * RLS, `has_permission` and every other `auth.uid()`-dependent check apply exactly as they would
 * for that user's own cookie session -- this is the whole point (MCP tools run with the calling
 * user's real permissions, not a service-role bypass). `persistSession`/`autoRefreshToken` are
 * off: this client is a one-shot per-request credential, not a long-lived session.
 */
export async function createUserScopedClient(userId: string) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("SUPABASE_JWT_SECRET is not set");

  const jwt = await mintUserJwt(userId, secret);

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    }
  );
}
