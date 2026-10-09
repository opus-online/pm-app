import { authenticateRequest } from "@/lib/mcp/auth";
import { buildMcpHandler, resolveKeyHash } from "@/lib/mcp/server";

// Streamable HTTP MCP endpoint (stateless). Auth runs HERE, before anything MCP-related:
// no valid Bearer key -> 401 JSON and no MCP server is even constructed. The session middleware
// skips /api/mcp (src/middleware.ts), so an unauthenticated call gets this 401, not a redirect.
async function handle(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req, resolveKeyHash);
  if (auth instanceof Response) return auth;
  const handler = await buildMcpHandler(auth);
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
