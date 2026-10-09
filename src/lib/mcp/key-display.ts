// Display helpers for MCP access keys (Settings → AI assistant, User access → AI keys).
// Spec: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md (Settings UI).
// Pure -- no server or browser imports, so both the server pages and the client card use it.

export type McpKeyStatus = "active" | "expired" | "revoked";

/** The only key fields that ever reach a client component -- never key_hash. */
export type McpKeyRow = {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  status: McpKeyStatus;
  /** Owner -- present only on the admin list. */
  owner?: { name: string; email: string };
};

type DbKey = {
  id: string;
  label: string;
  key_prefix: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export function mcpKeyStatus(
  key: { expires_at: string; revoked_at: string | null },
  now: Date = new Date(),
): McpKeyStatus {
  if (key.revoked_at) return "revoked";
  if (new Date(key.expires_at).getTime() <= now.getTime()) return "expired";
  return "active";
}

const STATUS_RANK: Record<McpKeyStatus, number> = { active: 0, expired: 1, revoked: 2 };

/** Field-by-field allowlist from a DB row; active keys first, then newest first. */
export function toMcpKeyRows<T extends DbKey>(
  keys: T[],
  owner?: (key: T) => McpKeyRow["owner"],
  now: Date = new Date(),
): McpKeyRow[] {
  return keys
    .map((k) => ({
      id: k.id,
      label: k.label,
      prefix: k.key_prefix,
      createdAt: k.created_at,
      expiresAt: k.expires_at,
      lastUsedAt: k.last_used_at,
      status: mcpKeyStatus(k, now),
      ...(owner ? { owner: owner(k) } : {}),
    }))
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.createdAt.localeCompare(a.createdAt),
    );
}

export function mcpEndpoint(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/mcp`;
}

export function claudeCodeCommand(origin: string, key: string): string {
  return `claude mcp add -s user --transport http pm-cms ${mcpEndpoint(origin)} --header "Authorization: Bearer ${key}"`;
}

/** Claude Desktop (mcp-remote) config. The header value is passed via an `env` var rather than
 * inlined in `args` -- on Windows, mcp-remote (and the shell that spawns `npx`) splits an
 * `args` string containing a literal space into two argv entries, breaking "Bearer <key>". An
 * env-var reference (`${AUTH_HEADER}`) is expanded by mcp-remote itself and is space-safe on
 * every platform. */
export function claudeDesktopConfig(origin: string, key: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        "pm-cms": {
          command: "npx",
          args: ["-y", "mcp-remote", mcpEndpoint(origin), "--header", "Authorization:${AUTH_HEADER}"],
          env: { AUTH_HEADER: `Bearer ${key}` },
        },
      },
    },
    null,
    2,
  );
}
