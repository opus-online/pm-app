import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
import { NAV_ITEMS } from "./nav-config";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { GlobalSearch } from "@/components/global-search";
import { UserMenu } from "./user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const isAdmin = current.role === "admin";

  const supabase = await createClient();

  // Permission-gated nav items (e.g. Sales) are only shown when the viewer actually holds the
  // permission -- checked in parallel via has_permission rather than hardcoding role names here.
  const gated = NAV_ITEMS.flatMap((i) => (i.permission ? [i.permission] : []));
  const checks = await Promise.all(
    gated.map((perm) =>
      supabase
        .rpc("has_permission", { uid: current.user.id, perm })
        .then((r) => (r.data === true ? perm : null))
    )
  );
  const permissions = checks.filter((p): p is Permission => p !== null);

  // Topbar avatar: the viewer's people-directory photo if they have one (RLS: view_people is
  // global for every seeded role, and a missing row just falls back to tinted initials).
  const { data: me } = await supabase
    .from("people")
    .select("avatar_url")
    .eq("user_id", current.user.id)
    .maybeSingle();

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar isAdmin={isAdmin} permissions={permissions} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
          </div>
          <div className="flex min-w-0 items-center gap-3">
            {/* Global search lives in the topbar so it's reachable from EVERY view (user ask);
                hidden on phones where the 288px input would crowd out the menu. */}
            <div className="max-sm:hidden">
              <GlobalSearch />
            </div>
            <UserMenu
              name={current.profile.full_name ?? current.profile.email}
              email={current.profile.email}
              avatarUrl={me?.avatar_url}
            />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
