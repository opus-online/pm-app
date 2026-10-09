import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Exactly /api/mcp is excluded (not sub-paths): it authenticates with its own Bearer key (src/app/api/mcp/route.ts) and
// must answer 401 JSON, never a session redirect to /login.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/mcp$|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
