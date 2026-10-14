import { createClient } from "@/lib/supabase/server";
import { toMcpConnectionRows, toMcpKeyRows } from "@/lib/mcp/key-display";
import { McpConnectionsTable, McpKeysTable } from "../../settings/ai-assistant-card";

/** User access → AI keys: every user's MCP access keys, revocable by the admin, and every active
 * claude.ai connector connection (read-only here -- users disconnect their own; an admin cuts
 * someone off by disabling the account). Server component -- the page already gated on
 * requireAdmin(), and the select policies' is_admin() branch is what actually returns other users'
 * rows. Owner name/email come from the user_profiles embed (admins read all profiles). Never
 * key_hash or client ids. */
export async function McpKeysSection() {
  const supabase = await createClient();
  const [{ data, error }, { data: conns, error: connError }] = await Promise.all([
    supabase
      .from("mcp_keys")
      .select(
        "id, label, key_prefix, created_at, expires_at, last_used_at, revoked_at, can_write, owner:user_profiles!mcp_keys_user_id_fkey(full_name, email)",
      ),
    supabase
      .from("mcp_connections")
      .select(
        "id, client_name, can_write, created_at, last_used_at, owner:user_profiles!mcp_connections_user_id_fkey(full_name, email)",
      )
      .is("revoked_at", null),
  ]);

  const keys = toMcpKeyRows(data ?? [], (k) => ({
    name: k.owner?.full_name ?? k.owner?.email ?? "Unknown user",
    email: k.owner?.email ?? "",
  }));
  const connections = toMcpConnectionRows(conns ?? [], (c) => ({
    name: c.owner?.full_name ?? c.owner?.email ?? "Unknown user",
    email: c.owner?.email ?? "",
  }));

  return (
    <section className="space-y-3 pt-6">
      <div>
        <h2 className="text-lg font-semibold">AI keys</h2>
      </div>
      {error ? (
        <p className="text-sm text-destructive">Failed to load keys.</p>
      ) : (
        <McpKeysTable keys={keys} showOwner emptyText="No one has created a key yet." />
      )}
      {connError ? (
        <p className="text-sm text-destructive">Failed to load connected apps.</p>
      ) : (
        connections.length > 0 && (
          <>
            <h3 className="pt-4 text-sm font-medium">Connected apps</h3>
            <McpConnectionsTable connections={connections} showOwner />
          </>
        )
      )}
    </section>
  );
}
