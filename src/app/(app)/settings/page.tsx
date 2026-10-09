import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import { humanize } from "../projects/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { toMcpKeyRows } from "@/lib/mcp/key-display";
import { ManagedListsCard, type ManagedOption } from "./managed-lists-card";
import { AiAssistantCard } from "./ai-assistant-card";

export default async function SettingsPage() {
  const current = await requireActiveUser();
  const supabase = await createClient();
  const isAdmin = current.role === "admin";

  // Session count only -- the full list/revoke UI already lives at /settings/sessions
  // (SessionsList), this just surfaces "how many" plus a link, rather than re-implementing it.
  // managed_options feeds the admin-only Lists card (role titles + teams for the person form).
  // mcp_keys: own rows only (RLS also lets admins see everyone's -- hence the explicit user_id
  // filter; the all-keys list lives on User access). Never key_hash.
  const [{ data: sessions }, { data: managedOptions }, { data: mcpKeys }] = await Promise.all([
    supabase.rpc("list_my_sessions"),
    isAdmin
      ? supabase
          .from("managed_options")
          .select("id, kind, value")
          .order("kind")
          .order("sort")
          .order("value")
      : Promise.resolve({ data: [] as ManagedOption[] }),
    supabase
      .from("mcp_keys")
      .select("id, label, key_prefix, created_at, expires_at, last_used_at, revoked_at")
      .eq("user_id", current.user.id),
  ]);
  const sessionCount = sessions?.length ?? 0;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Name" value={current.profile.full_name ?? "—"} />
          <Row label="Email" value={current.profile.email} />
          <Row label="Role" value={<Badge variant="outline">{humanize(current.role ?? "unknown")}</Badge>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Switch between light and dark mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <AiAssistantCard keys={toMcpKeyRows(mcpKeys ?? [])} />

      {isAdmin && <ManagedListsCard options={managedOptions ?? []} />}

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Devices currently signed in to your account.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {sessionCount} active session{sessionCount === 1 ? "" : "s"}
          </p>
          <Button variant="outline" size="sm" render={<Link href="/settings/sessions">Manage sessions</Link>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign out</CardTitle>
          <CardDescription>End all of your sessions on every device.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
