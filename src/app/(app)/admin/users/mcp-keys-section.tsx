import { createClient } from "@/lib/supabase/server";
import { toMcpKeyRows } from "@/lib/mcp/key-display";
import { McpKeysTable } from "../../settings/ai-assistant-card";

/** User access → AI keys: every user's MCP access keys, revocable by the admin. Server
 * component -- the page already gated on requireAdmin(), and the mcp_keys select policy's
 * is_admin() branch is what actually returns other users' rows. Owner name/email come from the
 * user_profiles embed (admins read all profiles). Never key_hash. */
export async function McpKeysSection() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcp_keys")
    .select(
      "id, label, key_prefix, created_at, expires_at, last_used_at, revoked_at, can_write, owner:user_profiles!mcp_keys_user_id_fkey(full_name, email)",
    );

  const keys = toMcpKeyRows(data ?? [], (k) => ({
    name: k.owner?.full_name ?? k.owner?.email ?? "Unknown user",
    email: k.owner?.email ?? "",
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
    </section>
  );
}
