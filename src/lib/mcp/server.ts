import "server-only";
import { createMcpHandler } from "mcp-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserScopedClient } from "@/lib/mcp/user-client";
import type { KeyResolver, McpAuth } from "@/lib/mcp/auth";
import { MCP_INSTRUCTIONS } from "@/lib/mcp/instructions";
import { FORBIDDEN_NAME_PATTERN, TOOLS } from "@/lib/mcp/registry";
import { runTool } from "@/lib/mcp/run-tool";
import type { ToolContext } from "@/lib/mcp/types";

// Service-role use is confined to this module and to exactly three calls: resolving a key hash
// (mcp_resolve_key) and bumping the per-key counters (mcp_bump_requests, mcp_bump_usage). Tools never see
// the admin client -- they get ToolContext.supabase, the user-scoped client.

/** Real key resolver: service-role `mcp_resolve_key(p_hash)` -- empty for unknown, revoked,
 * expired or non-active-user keys; stamps last_used_at on a hit. Throws on a DB error (the
 * caller turns that into a 503, never an anonymous pass-through). */
export const resolveKeyHash: KeyResolver = async (keyHash) => {
  const { data, error } = await createAdminClient().rpc("mcp_resolve_key", { p_hash: keyHash });
  if (error) throw new Error(`mcp_resolve_key: ${error.message}`);
  const row = data?.[0];
  return row ? { keyId: row.key_id, userId: row.user_id } : null;
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
  const ctx: ToolContext = {
    supabase: await createUserScopedClient(auth.userId),
    userId: auth.userId,
    keyId: auth.keyId,
  };

  return createMcpHandler(
    (server) => {
      for (const tool of TOOLS) {
        // Defence in depth: the registry test is the primary guard; refuse to even expose a
        // forbidden-looking tool if one ever slips in.
        if (FORBIDDEN_NAME_PATTERN.test(tool.name)) {
          throw new Error(`Refusing to register forbidden MCP tool name: ${tool.name}`);
        }
        server.registerTool(
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: false, openWorldHint: false },
          },
          (args) => runTool(tool, args, ctx, bumpUsage)
        );
      }
    },
    {
      serverInfo: { name: "pm-cms", version: "1.0.0" },
      instructions: MCP_INSTRUCTIONS,
    }
  );
}
