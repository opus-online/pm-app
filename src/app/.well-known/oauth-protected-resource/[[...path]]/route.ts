import { getPublicOrigin } from "mcp-handler";
import { appOrigin, protectedResourceMetadata } from "@/lib/mcp/oauth-metadata";

// RFC 9728 discovery for /api/mcp (served at the root and at the path-suffixed URL MCP clients try
// first). Public and CORS-open: browser-based MCP clients fetch it cross-origin.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
};

export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(
    appOrigin(process.env.NEXT_PUBLIC_SITE_URL, getPublicOrigin(req)),
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
  ), {
    headers: { ...CORS, "cache-control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
