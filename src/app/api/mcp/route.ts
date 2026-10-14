import { getPublicOrigin } from "mcp-handler";
import { authenticateRequest, enforceRequestCeiling, jsonError } from "@/lib/mcp/auth";
import { appOrigin, resourceMetadataUrl } from "@/lib/mcp/oauth-metadata";
import { buildMcpHandler, bumpRequests, resolveKeyHash, resolveOAuthToken } from "@/lib/mcp/server";

// Streamable HTTP MCP endpoint (stateless). Auth runs HERE, before anything MCP-related: a Bearer
// `pmk_` key or a Supabase OAuth access token (claude.ai connector). No valid credential -> 401
// JSON with the RFC 9728 `WWW-Authenticate` challenge (how claude.ai finds the login) and no MCP
// server is even constructed; over the per-credential request ceiling -> 429 JSON. The session
// middleware skips exactly /api/mcp (src/middleware.ts), so an unauthenticated call gets this
// 401, not a redirect.
async function handle(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req, resolveKeyHash, {
    resolveOAuth: resolveOAuthToken,
    resourceMetadataUrl: resourceMetadataUrl(appOrigin(process.env.NEXT_PUBLIC_SITE_URL, getPublicOrigin(req))),
  });
  if (auth instanceof Response) return auth;

  const limited = await enforceRequestCeiling(auth, bumpRequests);
  if (limited) return limited;

  try {
    const handler = await buildMcpHandler(auth);
    return await handler(req);
  } catch (err) {
    console.error("mcp handler failed:", err instanceof Error ? err.message : String(err));
    return jsonError(503, "unavailable", "The AI assistant endpoint is temporarily unavailable. Try again shortly.");
  }
}

export { handle as GET, handle as POST, handle as DELETE };
