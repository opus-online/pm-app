import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Exactly /api/mcp is excluded (not sub-paths): it authenticates with its own Bearer credential (src/app/api/mcp/route.ts)
// and must answer 401 JSON, never a session redirect to /login. The OAuth protected-resource metadata
// (src/app/.well-known/oauth-protected-resource) is public: claude.ai reads it before anyone logs in.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/mcp$|\\.well-known/oauth-protected-resource|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
