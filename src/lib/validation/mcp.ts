import { z } from "zod";

// Spec: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md (Expiry), hardened
// 2026-10-12: max 90 days. The DB's own backstop (the "insert own mcp_keys" RLS policy) checks
// `expires_at <= now() + interval '91 days'`.
export const MCP_KEY_EXPIRY_DAYS = [30, 90] as const;
export type McpKeyExpiryDays = (typeof MCP_KEY_EXPIRY_DAYS)[number];

export const createMcpKeySchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Label is required")
    .max(100, "Label is too long"),
  days: z.union([z.literal(30), z.literal(90)], {
    error: "Choose an expiry of 30 or 90 days",
  }),
  /** false = read-only key (the default); fixed at creation. */
  canWrite: z.boolean().default(false),
});

export type CreateMcpKeyInput = z.input<typeof createMcpKeySchema>;
export type CreateMcpKeyOutput = z.output<typeof createMcpKeySchema>;
