// RFC 9728 protected-resource metadata for /api/mcp: tells MCP clients (claude.ai) that
// Supabase Auth's OAuth 2.1 server issues tokens for it. Pure -- unit-tested directly.
// Spec: docs/superpowers/specs/2026-10-14-claude-connector-oauth-design.md
export const MCP_RESOURCE_PATH = "/api/mcp";

const trim = (url: string) => url.replace(/\/+$/, "");

/** The app's public origin: the configured site URL when set (never a request header a client
 * could spoof into a cached metadata document), else the request's own origin (local dev). */
export function appOrigin(configured: string | undefined, requestOrigin: string): string {
  return trim(configured || requestOrigin);
}

export function authServerUrl(supabaseUrl: string): string {
  return `${trim(supabaseUrl)}/auth/v1`;
}

export function resourceMetadataUrl(origin: string): string {
  return `${trim(origin)}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`;
}

export function protectedResourceMetadata(origin: string, supabaseUrl: string) {
  return {
    resource: `${trim(origin)}${MCP_RESOURCE_PATH}`,
    authorization_servers: [authServerUrl(supabaseUrl)],
    bearer_methods_supported: ["header"],
    resource_name: "PM app",
  };
}
