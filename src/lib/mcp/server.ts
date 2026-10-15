import "server-only";
import { createMcpHandler } from "mcp-handler";
import { createClient as createSupabaseClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserScopedClient } from "@/lib/mcp/user-client";
import { oauthIdentity, type KeyResolver, type McpAuth, type OAuthResolver } from "@/lib/mcp/auth";
import { mcpInstructions } from "@/lib/mcp/instructions";
import { isForbiddenToolName, toolsForKey } from "@/lib/mcp/registry";
import { runTool } from "@/lib/mcp/run-tool";
import type { ToolAuditEntry, ToolContext } from "@/lib/mcp/types";
import { writeAudit } from "@/lib/audit";

// Service-role use is confined to this module: resolving a key hash (mcp_resolve_key) or an
// OAuth connection (mcp_resolve_connection) and bumping the per-key counters (mcp_bump_requests, mcp_bump_usage) -- plus
// audit_logs inserts via writeAudit (ToolContext.audit). Tools never see the admin client -- they
// get ToolContext.supabase, the user-scoped client.

/** Real key resolver: service-role `mcp_resolve_key(p_hash)` -- empty for unknown, revoked,
 * expired or non-active-user keys; stamps last_used_at on a hit. Throws on a DB error (the
 * caller turns that into a 503, never an anonymous pass-through). */
export const resolveKeyHash: KeyResolver = async (keyHash) => {
  const { data, error } = await createAdminClient().rpc("mcp_resolve_key", { p_hash: keyHash });
  if (error) throw new Error(`mcp_resolve_key: ${error.message}`);
  const row = data?.[0];
  // Anything but an explicit true is read-only (fail closed).
  return row ? { keyId: row.key_id, userId: row.user_id, canWrite: row.can_write === true } : null;
};

/** Real OAuth resolver: verifies the Supabase-issued access token (getClaims handles both HS256
 * and asymmetric signing), requires an OAuth client_id claim, then the service-role
 * `mcp_resolve_connection` -- empty for disconnected connections or inactive users. Network
 * failures throw (-> 503); invalid/expired tokens return null (-> 401 + challenge). */
export const resolveOAuthToken: OAuthResolver = async (token) => {
  const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getClaims(token);
  if (error) {
    if (isAuthRetryableFetchError(error)) throw new Error(`getClaims: ${error.message}`);
    return null;
  }
  const identity = oauthIdentity(data?.claims);
  if (!identity) return null;

  const { data: rows, error: rpcError } = await createAdminClient().rpc("mcp_resolve_connection", {
    p_user: identity.userId,
    p_client: identity.clientId,
    p_issued_at: identity.issuedAt,
  });
  if (rpcError) throw new Error(`mcp_resolve_connection: ${rpcError.message}`);
  const row = rows?.[0];
  return row ? { userId: identity.userId, keyId: row.connection_id, canWrite: row.can_write === true } : null;
};

/** Increments and returns this minute's authenticated-request count (any method) for the key. */
export async function bumpRequests(keyId: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("mcp_bump_requests", { p_key_id: keyId });
  if (error) throw new Error(`mcp_bump_requests: ${error.message}`);
  return data;
}

/** Increments and returns this minute's tool-call count for the key. */
async function bumpUsage(keyId: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("mcp_bump_usage", { p_key_id: keyId });
  if (error) throw new Error(`mcp_bump_usage: ${error.message}`);
  return data;
}

/** Builds the per-request MCP handler for an authenticated key. Per request because the
 * server is stateless (mcp-handler constructs a fresh McpServer per HTTP request anyway) and
 * this way the identity is captured in a closure from the route's own auth check -- tools can't
 * be reached without it. */
export async function buildMcpHandler(auth: McpAuth): Promise<(req: Request) => Promise<Response>> {
  // Both credential kinds talk to the database with a freshly minted 5-minute JWT for the user.
  // OAuth tokens are never forwarded: the database refuses them (reject_oauth_client_tokens).
  const supabase = await createUserScopedClient(auth.userId);
  let actorEmail: Promise<string | null> | null = null;
  const ctx: ToolContext = {
    supabase,
    userId: auth.userId,
    keyId: auth.keyId,
    canWrite: auth.canWrite,
    via: auth.kind,
    audit: async (entry: ToolAuditEntry) => {
      // The actor's email comes from their own profile row (user-scoped read), fetched once.
      actorEmail ??= Promise.resolve(
        supabase.from("user_profiles").select("email").eq("id", auth.userId).maybeSingle()
      ).then(({ data }) => data?.email ?? null, () => null);
      await writeAudit({
        action: entry.action,
        actorId: auth.userId,
        actorEmail: await actorEmail,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        metadata: {
          ...entry.metadata,
          via: "mcp",
          ...(auth.kind === "key" ? { key_id: auth.keyId } : { connection_id: auth.keyId }),
        },
      });
    },
  };

  return createMcpHandler(
    (server) => {
      for (const tool of toolsForKey(auth.canWrite)) {
        // Defence in depth: the registry test is the primary guard; refuse to even expose a
        // forbidden-looking tool if one ever slips in.
        if (isForbiddenToolName(tool.name)) {
          throw new Error(`Refusing to register forbidden MCP tool name: ${tool.name}`);
        }
        server.registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            // Every write is flagged destructive so MCP clients ask the user before running it --
            // the server-side counterpart to the "confirm before any change" instruction.
            annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: !tool.readOnly, openWorldHint: false },
          },
          (args) => runTool(tool, args, ctx, bumpUsage)
        );
      }
    },
    {
      serverInfo: { name: "pm-cms", version: "1.0.0" },
      instructions: mcpInstructions(auth.canWrite),
    }
  );
}
