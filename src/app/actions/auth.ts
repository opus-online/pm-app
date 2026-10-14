"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { safeNextPath } from "@/lib/auth/gate";
import {
  loginSchema,
  signupSchema,
  type LoginInput,
  type SignupInput,
} from "@/lib/validation/auth";

export async function signInAction(input: LoginInput, next?: string) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid email or password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    await writeAudit({
      action: "auth.login_failed",
      actorEmail: parsed.data.email,
      metadata: { reason: error.message },
    });
    return { error: "Invalid email or password." };
  }

  await writeAudit({
    action: "auth.login",
    actorId: data.user.id,
    actorEmail: data.user.email,
  });
  // `next` only ever returns to the claude.ai connector consent page (safeNextPath);
  // middleware reroutes pending/disabled users.
  redirect(safeNextPath(next) ?? "/dashboard");
}

export async function signUpAction(input: SignupInput) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { error: "Please fix the highlighted fields." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error) return { error: error.message };

  await writeAudit({
    action: "auth.signup",
    actorId: data.user?.id,
    actorEmail: parsed.data.email,
  });
  redirect("/pending");
}

export async function signInWithAzureAction() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      scopes: "openid profile email",
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error || !data?.url) {
    return {
      error:
        "Microsoft sign-in is not configured yet. Ask an administrator, or use email and password.",
    };
  }
  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await writeAudit({
      action: "auth.logout",
      actorId: user.id,
      actorEmail: user.email,
      metadata: { scope: "global" },
    });
  }
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}
