import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Database } from "@/lib/database.types";
import type { AuditAction } from "@/lib/audit";

/** One audit row for a write tool. The server fills in the actor (the key's user) and adds
 * `metadata.via = 'mcp'` and `metadata.key_id` -- tools can't forge either. */
export type ToolAuditEntry = {
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
};

/** Everything a tool may use. `supabase` is ALWAYS the user-scoped client (anon key + a JWT minted
 * for `userId`) -- RLS applies exactly as for the user's own session. Tools never get the
 * service-role client. */
export type ToolContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  keyId: string;
  /** Writes an audit_logs row (service role, inside writeAudit -- the one allowed audit use). */
  audit: (entry: ToolAuditEntry) => Promise<void>;
};

/** A user-facing failure: its message is safe to show the model/user verbatim. Any other thrown
 * error is logged server-side and replaced by a generic message (never raw DB text). */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject;
  readOnly: boolean;
  /** Validates `args` against inputSchema and runs the tool; returns the text result. */
  run: (args: unknown, ctx: ToolContext) => Promise<string>;
};

/** Typed tool definition: the handler sees parsed, typed input. */
export function defineTool<S extends z.ZodObject>(def: {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  readOnly: boolean;
  handler: (input: z.infer<S>, ctx: ToolContext) => Promise<string>;
}): ToolDef {
  const { handler, ...rest } = def;
  return {
    ...rest,
    run: async (args, ctx) => {
      const parsed = def.inputSchema.safeParse(args ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
        throw new ToolError(`Invalid input. ${where}${issue?.message ?? ""}`.trim());
      }
      return handler(parsed.data, ctx);
    },
  };
}
