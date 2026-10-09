// One tool call, end to end: rate limit first, then the tool. Pure (the usage counter is
// injected) so the "call 61 is refused and the tool never runs" rule is unit-tested directly
// (tests/mcp-auth.test.ts). Wired to the real service-role mcp_bump_usage in ./server.ts.
import { RATE_LIMIT_MESSAGE, isRateLimited } from "@/lib/mcp/rate-limit";
import { ToolError, type ToolContext, type ToolDef } from "@/lib/mcp/types";

export type TextResult = { content: { type: "text"; text: string }[]; isError?: boolean };

/** Increments and returns this minute's call count for the key. */
export type UsageBumper = (keyId: string) => Promise<number>;

function textResult(text: string, isError = false): TextResult {
  return isError ? { content: [{ type: "text", text }], isError: true } : { content: [{ type: "text", text }] };
}

/** Bumps the key's usage counter BEFORE running anything; over the limit (or counter failure)
 * the tool is never invoked. ToolError messages pass through verbatim; any other failure is
 * logged server-side and replaced by a generic message (never raw DB text). */
export async function runTool(tool: ToolDef, args: unknown, ctx: ToolContext, bump: UsageBumper): Promise<TextResult> {
  let calls: number;
  try {
    calls = await bump(ctx.keyId);
  } catch (err) {
    console.error("mcp rate-limit bump failed:", err instanceof Error ? err.message : err);
    return textResult("Could not run the tool right now. Try again shortly.", true);
  }
  if (isRateLimited(calls)) return textResult(RATE_LIMIT_MESSAGE, true);

  try {
    return textResult(await tool.run(args, ctx));
  } catch (err) {
    if (err instanceof ToolError) return textResult(err.message, true);
    console.error(`mcp tool ${tool.name} failed:`, err instanceof Error ? err.message : err);
    return textResult("Something went wrong running this tool. Try again.", true);
  }
}
