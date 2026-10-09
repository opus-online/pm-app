import { z } from "zod";

// Spec: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md (Expiry). The three
// expiry choices offered at key creation; the DB's own backstop (the "insert own mcp_keys" RLS
// policy) only checks `expires_at <= now() + interval '366 days'`, so this is the UI-facing
// subset of that, not a re-statement of the full range.
export const MCP_KEY_EXPIRY_DAYS = [30, 90, 365] as const;
export type McpKeyExpiryDays = (typeof MCP_KEY_EXPIRY_DAYS)[number];

export const createMcpKeySchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Label is required")
    .max(100, "Label is too long"),
  days: z.union([z.literal(30), z.literal(90), z.literal(365)], {
    error: "Choose an expiry of 30, 90 or 365 days",
  }),
});

export type CreateMcpKeyInput = z.input<typeof createMcpKeySchema>;
export type CreateMcpKeyOutput = z.output<typeof createMcpKeySchema>;
