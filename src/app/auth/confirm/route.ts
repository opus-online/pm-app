import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

// Password-reset email link (supabase/templates/recovery.html):
// /auth/confirm?token_hash=...&type=recovery. Verifying the token signs the user in, then they
// pick a new password. Always continues to /reset-password -- never to a URL from the link.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (tokenHash && type === "recovery") {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (!error && data.user) {
      await writeAudit({
        action: "auth.login",
        actorId: data.user.id,
        actorEmail: data.user.email,
        metadata: { provider: "password_reset_link" },
      });
      return NextResponse.redirect(`${origin}/reset-password`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link_invalid`);
}
