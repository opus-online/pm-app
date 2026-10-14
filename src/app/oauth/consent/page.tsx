import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { consentProblem, isAllowedRedirectUrl } from "@/lib/mcp/oauth-consent";
import { clientRedirectsAllowed } from "@/lib/mcp/oauth-client-check";

const NOT_ALLOWED = "This app isn't allowed to connect to PM app.";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConsentForm } from "./consent-form";

// claude.ai connector consent. Supabase Auth's OAuth server sends the browser here with
// ?authorization_id=…; the middleware has already ensured a logged-in session (logged-out
// visitors go to /login?next=… and come back).
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;
  const current = await requireActiveUser();
  if (!authorizationId) return <Problem text="This connection request is missing. Start again from Claude." />;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return <Problem text="This connection request has expired. Start again from Claude." />;
  // Already consented: Supabase hands back a ready redirect with a code. Only follow it to an
  // allowlisted callback (a client may have registered other addresses too).
  if (!("authorization_id" in data)) {
    if (!isAllowedRedirectUrl(data.redirect_url)) return <Problem text={NOT_ALLOWED} />;
    redirect(data.redirect_url);
  }

  const problem = consentProblem(data, current.user.id);
  if (problem) return <Problem text={problem} />;
  if (!(await clientRedirectsAllowed(data.client.id))) return <Problem text={NOT_ALLOWED} />;

  return (
    <ConsentForm
      authorizationId={authorizationId}
      appName={data.client.name?.trim() || "Unknown app"}
      userName={current.profile.full_name ?? current.profile.email}
      userEmail={current.profile.email}
    />
  );
}

function Problem({ text }: { text: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Can&apos;t connect</CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
