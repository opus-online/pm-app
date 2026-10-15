export type UserStatus = "pending" | "active" | "disabled";

export type GateInput = {
  pathname: string;
  /** Raw query string incl. leading "?" (or ""). */
  search?: string;
  isAuthenticated: boolean;
  status: UserStatus | null;
};

const CONSENT_PATH = "/oauth/consent";
const GATE_ORIGIN = "http://gate.local";

/** Where to go after login: only the OAuth consent page, same-origin (open-redirect guard). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(next, GATE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== GATE_ORIGIN || url.pathname !== CONSENT_PATH) return null;
  return `${url.pathname}${url.search}`;
}

const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/auth"];

const OAUTH_RESOURCE_METADATA = "/.well-known/oauth-protected-resource";

/** Paths that authenticate on their own (Bearer credential) or are public discovery documents:
 * the middleware never touches the session or redirects to /login for them. */
export function isSessionlessPath(pathname: string): boolean {
  return pathname === "/api/mcp"
    || pathname === OAUTH_RESOURCE_METADATA
    || pathname.startsWith(`${OAUTH_RESOURCE_METADATA}/`);
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** Pure routing decision used by middleware. Returns a redirect target or null. */
export function decideRedirect(input: GateInput): string | null {
  const { pathname, isAuthenticated, status } = input;

  if (!isAuthenticated) {
    if (isPublicPath(pathname)) return null;
    // The claude.ai connector's consent page survives the login detour.
    return pathname === CONSENT_PATH
      ? `/login?next=${encodeURIComponent(pathname + (input.search ?? ""))}`
      : "/login";
  }
  if (status === "disabled") {
    return pathname === "/login" ? null : "/login?error=account_disabled";
  }
  if (status === "pending") {
    return pathname === "/pending" ? null : "/pending";
  }
  // active: the middleware maps missing/unreadable profile rows to
  // "pending" before calling this gate, so a null status here means
  // "verified active" or that the gate is being used outside middleware.
  if (pathname === "/login") {
    const next = safeNextPath(new URLSearchParams(input.search ?? "").get("next"));
    if (next) return next;
  }
  if (isPublicPath(pathname) && !pathname.startsWith("/auth/")) return "/dashboard";
  if (pathname === "/pending" || pathname === "/") return "/dashboard";
  return null;
}
