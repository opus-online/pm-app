import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { pickMainRole } from "@/lib/auth/roles";

export type Profile = Database["public"]["Tables"]["user_profiles"]["Row"];

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*, user_roles!user_roles_user_id_fkey(role_key)")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const { user_roles: roleRows, ...profileFields } = profile;
  const roles = (roleRows ?? []).map((r) => r.role_key);
  return {
    user,
    profile: profileFields as Profile,
    role: pickMainRole(roles),
    roles,
  };
}

/** Shared pre-check for every server action. Throws unless logged in + approved. */
export async function requireActiveUser() {
  const current = await getCurrentUser();
  if (!current || current.profile.status !== "active") {
    throw new Error("Not authorized");
  }
  return current;
}

export async function requireAdmin() {
  const current = await requireActiveUser();
  if (current.role !== "admin") {
    throw new Error("Admin permission required");
  }
  return current;
}
