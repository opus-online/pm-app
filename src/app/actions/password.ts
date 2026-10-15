"use server";

import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdmin, requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@/lib/validation/auth";

// Password reset, self-service change and admin-triggered reset.
// Reset emails link to /auth/confirm?token_hash=...&type=recovery (supabase/templates/recovery.html,
// and the same template on the hosted project): a token link, not a PKCE code, so it works in any
// browser -- including when an admin sends it for someone else.

/** A throwaway anon client: no cookies read or written, so sending a reset email or checking a
 * password never touches the caller's own session. */
function anonClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

async function sendResetEmail(email: string) {
  return anonClient().auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/confirm` });
}

const SEND_FAILED = "Could not send the email right now. Try again in a few minutes.";

/** Forgot password (signed out). Always answers the same way whether or not the account exists,
 * so the form can't be used to find out who has an account. */
export async function requestPasswordResetAction(
  input: ForgotPasswordInput
): Promise<{ error: string } | { success: true }> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a valid email." };

  const { error } = await sendResetEmail(parsed.data.email);
  // Rate limiting is the only error worth surfacing; anything else would leak account existence.
  if (error?.status === 429) return { error: SEND_FAILED };
  if (error) console.error("password reset email failed:", error.message);

  await writeAudit({ action: "auth.password_reset_requested", actorEmail: parsed.data.email });
  return { success: true as const };
}

/** New password after the reset link signed the user in (/reset-password). */
export async function resetPasswordAction(input: ResetPasswordInput): Promise<{ error: string } | void> {
  const current = await requireActiveUser();
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: passwordError(error.message) };

  await writeAudit({
    action: "auth.password_changed",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    metadata: { via: "reset_link" },
  });
  redirect("/dashboard");
}

/** Signed-in user changes their own password (Settings) -- the current one is checked first. */
export async function changePasswordAction(
  input: ChangePasswordInput
): Promise<{ error: string } | { success: true }> {
  const current = await requireActiveUser();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password." };

  const checker = anonClient();
  const check = await checker.auth.signInWithPassword({ email: current.profile.email, password: parsed.data.current });
  if (check.error) return { error: "Your current password is wrong." };
  // The check opened a session of its own -- end just that one.
  await checker.auth.signOut({ scope: "local" });

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: passwordError(error.message) };

  await writeAudit({
    action: "auth.password_changed",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    metadata: { via: "settings" },
  });
  return { success: true as const };
}

/** Admin → User access → Manage → Send password reset. */
export async function adminSendPasswordResetAction(userId: string): Promise<{ error: string } | { success: true }> {
  const admin = await requireAdmin();
  if (!z.uuid().safeParse(userId).success) return { error: "Invalid user id." };

  const supabase = await createClient();
  const { data: profile } = await supabase.from("user_profiles").select("email").eq("id", userId).maybeSingle();
  if (!profile?.email) return { error: "User not found." };

  const { error } = await sendResetEmail(profile.email);
  if (error) {
    console.error("admin password reset email failed:", error.message);
    return { error: SEND_FAILED };
  }

  await writeAudit({
    action: "user.password_reset_sent",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: userId,
    metadata: { email: profile.email },
  });
  return { success: true as const };
}

function passwordError(message: string): string {
  if (/should be different/i.test(message)) return "Choose a different password.";
  if (/weak|password/i.test(message)) return "That password isn't strong enough.";
  return "Could not change the password. Try again.";
}
