import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { mintUserJwt } from "@/lib/mcp/jwt";

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

