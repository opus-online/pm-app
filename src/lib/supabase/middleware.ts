import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRedirect, type UserStatus } from "@/lib/auth/gate";
import type { Database } from "@/lib/database.types";

/** The MCP endpoint authenticates with its own Bearer key, never a session cookie. */
export function isMcpPath(pathname: string): boolean {
  return pathname === "/api/mcp";
}

export async function updateSession(request: NextRequest) {
  // Belt and braces with the matcher exclusion in src/middleware.ts: never touch the session or
  // redirect for /api/mcp -- an unauthenticated MCP call must get the route's 401 JSON.
  if (isMcpPath(request.nextUrl.pathname)) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      },
    }
  );

  // IMPORTANT: getUser() validates the JWT against Supabase — never trust getSession() here
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let status: UserStatus | null = null;
  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("status")
      .eq("id", user.id)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      // Fail closed: the session may be perfectly valid, but we couldn't
      // read the profile, so we can't confirm the user's status. Don't
      // sign out (that would be discarding a possibly-good session) —
      // just refuse to grant access and send them to /login.
      console.error("middleware profile lookup failed:", profileError.message);
      return redirectWithCookies(request, supabaseResponse, "/login");
    }

    if (!profile) {
      // PGRST116 (zero rows) or otherwise missing data. A DB trigger
      // guarantees a profile row per user, so this is abnormal — treat
      // it as "pending" (locked to /pending) rather than granting access.
      status = "pending";
    } else {
      status = (profile.status as UserStatus | undefined) ?? null;
    }

    if (status === "disabled") {
      await supabase.auth.signOut({ scope: "local" });
    }
  }

  const target = decideRedirect({
    pathname: request.nextUrl.pathname,
    isAuthenticated: !!user,
    status,
  });

  if (target) {
    return redirectWithCookies(request, supabaseResponse, target);
  }

  return supabaseResponse;
}

function redirectWithCookies(
  request: NextRequest,
  supabaseResponse: NextResponse,
  target: string
): NextResponse {
  const url = request.nextUrl.clone();
  const [pathname, query] = target.split("?");
  url.pathname = pathname;
  url.search = query ? `?${query}` : "";

  const redirectResponse = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}
