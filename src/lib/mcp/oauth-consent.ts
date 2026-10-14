// Consent-page rules for the claude.ai connector. Pure -- unit-tested directly.
// Dynamic client registration lets anyone register an OAuth client with any name, so the page
// only lets users approve clients that send them back to Claude (or a local Claude Code/Desktop).
const CLAUDE_CALLBACKS = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:") return !url.search && CLAUDE_CALLBACKS.has(`${url.origin}${url.pathname}`);
  return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
}

/** A full redirect (callback + ?code=&state=) Supabase hands back for an already-consented
 * client: its base must be allowlisted -- otherwise a client that registered extra redirect URIs
 * could have codes sent anywhere once the user consented to it via a Claude callback. */
export function isAllowedRedirectUrl(redirectUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectUrl);
  } catch {
    return false;
  }
  if (url.hash) return false;
  return isAllowedRedirectUri(`${url.origin}${url.pathname}`);
}

/** Every redirect URI a client registered must be allowlisted, not just the one in this request. */
export function allRedirectUrisAllowed(uris: string[]): boolean {
  return uris.length > 0 && uris.every(isAllowedRedirectUri);
}

/** Why this authorization can't be approved by `userId`, or null if it can. */
export function consentProblem(details: { redirect_uri: string; user: { id: string } }, userId: string): string | null {
  if (details.user.id !== userId) return "This request was started from a different account. Start again from Claude.";
  if (!isAllowedRedirectUri(details.redirect_uri)) return "This app isn't allowed to connect to PM app.";
  return null;
}
