import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { consentProblem } from "@/lib/mcp/oauth-consent";
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
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const problem = consentProblem(data, current.user.id);
  if (problem) return <Problem text={problem} />;

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
