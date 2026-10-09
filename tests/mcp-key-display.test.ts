import { describe, expect, it } from "vitest";
import {
  claudeCodeCommand,
  claudeDesktopConfig,
  mcpKeyStatus,
  toMcpKeyRows,
} from "@/lib/mcp/key-display";

const NOW = new Date("2026-10-09T12:00:00Z");

const base = {
  label: "Laptop",
  key_prefix: "pmk_abcd",
  created_at: "2026-10-01T10:00:00Z",
  expires_at: "2027-01-01T00:00:00Z",
  last_used_at: null,
  revoked_at: null,
};

describe("mcpKeyStatus", () => {
  it("is active before expiry", () => {
    expect(mcpKeyStatus(base, NOW)).toBe("active");
  });
  it("is expired at or after expiry", () => {
    expect(mcpKeyStatus({ ...base, expires_at: "2026-10-09T12:00:00Z" }, NOW)).toBe("expired");
  });
  it("revoked wins over expired", () => {
    expect(
      mcpKeyStatus({ ...base, expires_at: "2026-01-01T00:00:00Z", revoked_at: "2025-12-01T00:00:00Z" }, NOW),
    ).toBe("revoked");
  });
});

describe("toMcpKeyRows", () => {
  it("allowlists fields (never key_hash) and sorts active first, newest first", () => {
    const rows = toMcpKeyRows(
      [
        { ...base, id: "a", key_hash: "secret", revoked_at: "2026-10-02T00:00:00Z" },
        { ...base, id: "b", key_hash: "secret", created_at: "2026-10-02T00:00:00Z" },
        { ...base, id: "c", key_hash: "secret", created_at: "2026-10-05T00:00:00Z" },
      ],
      undefined,
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(rows[2].status).toBe("revoked");
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(
        ["createdAt", "expiresAt", "id", "label", "lastUsedAt", "prefix", "status"].sort(),
      );
    }
  });
  it("adds the owner when a resolver is given", () => {
    const [row] = toMcpKeyRows([{ ...base, id: "a" }], () => ({ name: "Sara", email: "s@x.ee" }), NOW);
    expect(row.owner).toEqual({ name: "Sara", email: "s@x.ee" });
  });
});

describe("connect snippets", () => {
  it("builds the Claude Code command", () => {
    expect(claudeCodeCommand("https://pm.example.com/", "pmk_x")).toBe(
      'claude mcp add -s user --transport http pm-cms https://pm.example.com/api/mcp --header "Authorization: Bearer pmk_x"',
    );
  });
  it("builds the Claude Desktop mcp-remote config (Windows-safe: no space in args, key via env)", () => {
    expect(JSON.parse(claudeDesktopConfig("http://localhost:3000", "pmk_x"))).toEqual({
      mcpServers: {
        "pm-cms": {
          command: "npx",
          args: ["-y", "mcp-remote", "http://localhost:3000/api/mcp", "--header", "Authorization:${AUTH_HEADER}"],
          env: { AUTH_HEADER: "Bearer pmk_x" },
        },
      },
    });
  });
});
