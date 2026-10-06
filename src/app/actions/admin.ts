"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import {
  approveUserSchema, changeUserRoleSchema, type ApproveUserInput,
} from "@/lib/validation/auth";

export async function approveUserAction(
  input: ApproveUserInput
): Promise<{ error: string } | { success: true }> {
  const admin = await requireAdmin();
  const parsed = approveUserSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid approval request." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .update({
      status: "active",
      approved_by: admin.user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.userId)
    .eq("status", "pending")
    .select("id");

  if (error) return { error: "Approval failed. Try again." };
  if (!data || data.length === 0)
    return { error: "User is not pending approval." };

  const { error: roleError } = await supabase.from("user_roles").upsert({
    user_id: parsed.data.userId,
    role_key: parsed.data.role,
    granted_by: admin.user.id,
  });
  if (roleError)
    return {
      error:
        "Role assignment failed. User is active but has no role — retry the approval.",
    };

  const service = createAdminClient();
  const { error: notificationError } = await service
    .from("notifications")
    .insert({
      user_id: parsed.data.userId,
      type: "user_approved",
      title: "Account approved",
      body: `You now have access as ${parsed.data.role.replace("_", " ")}.`,
    });
  if (notificationError)
    console.error(
      "approval notification insert failed:",
      notificationError.message
    );

  await writeAudit({
    action: "user.approved",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: parsed.data.userId,
    metadata: { role: parsed.data.role },
  });

  revalidatePath("/admin/users");
  return { success: true as const };
}

/**
 * Inline "change role" cell on the admin users table (ux-interaction-audit.md #35 -- there was
 * previously no way to re-role a user after their initial approval).
 *
 * Main role only — the sales add-on is managed by setSalesAccessAction.
 *
 * Uses requirePermission('manage_users') rather than requireAdmin() -- same effective gate today
 * (manage_users has no role_permissions rows, so only the is_admin() bypass in has_permission
 * satisfies it) but goes through the same permission-model boundary as every other action instead
 * of a hardcoded role check. The "admins manage/update/delete user_roles" RLS policies (all
 * `using/with check (is_admin())`) are the real backstop regardless of what this does.
 */
export async function changeUserRoleAction(
  userId: string,
  roleKey: string
): Promise<{ error: string } | { success: true }> {
  const admin = await requirePermission("manage_users");

  const parsed = changeUserRoleSchema.safeParse({ userId, role: roleKey });
  if (!parsed.success) return { error: "Invalid role." };

  if (parsed.data.userId === admin.user.id)
    return { error: "You cannot change your own role." };

  const supabase = await createClient();

  // Atomic single-role swap via a SECURITY DEFINER RPC (one transaction): replaces whatever
  // role the user holds with the new one, or leaves them untouched on failure -- never roleless.
  const { error: swapError } = await supabase.rpc("set_user_role", {
    target_user: parsed.data.userId,
    new_role: parsed.data.role,
  });
  if (swapError) return { error: "Role change failed. Try again." };

  await writeAudit({
    action: "user.role_changed",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: parsed.data.userId,
    metadata: { role: parsed.data.role },
  });

  revalidatePath("/admin/users");
  return { success: true as const };
}

/** Sales add-on toggle (users-table.tsx "Sales" column switch). Separate from
 * changeUserRoleAction: this grants/revokes the `sales` role alongside the user's main role
 * rather than swapping it, via the admin-only, self-auditing set_sales_access RPC. */
export async function setSalesAccessAction(
  userId: string,
  enabled: boolean
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(userId).success) return { error: "Invalid user." };
  const current = await requirePermission("manage_users");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_sales_access", {
    target_user: userId,
    enabled,
  });
  if (error) return { error: "Could not update Sales access." };

  await writeAudit({
    action: "user.sales_access_changed",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "user",
    resourceId: userId,
    metadata: { enabled },
  });

  revalidatePath("/admin/users");
  return { success: true as const };
}

const statusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "disabled"]),
});

export async function setUserStatusAction(
  input: z.infer<typeof statusSchema>
): Promise<{ error: string } | { success: true }> {
  const admin = await requireAdmin();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  if (parsed.data.userId === admin.user.id)
    return { error: "You cannot change your own status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.userId);
  if (error) return { error: "Update failed." };

  let revokeFailed = false;
  let revokedCount: number | null = null;
  if (parsed.data.status === "disabled") {
    const { data, error: revokeError } = await supabase.rpc(
      "admin_revoke_user_sessions",
      { target_user: parsed.data.userId }
    );
    revokedCount = data ?? null;
    revokeFailed = Boolean(revokeError);
  }

  await writeAudit({
    action: "user.status_changed",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: parsed.data.userId,
    metadata: {
      status: parsed.data.status,
      ...(parsed.data.status === "disabled"
        ? {
            sessions_revoked: revokedCount ?? 0,
            revoke_failed: revokeFailed,
          }
        : {}),
    },
  });

  revalidatePath("/admin/users");

  if (revokeFailed)
    return {
      error:
        "User disabled, but revoking their sessions failed — use 'Log out from all devices' to retry.",
    };

  return { success: true as const };
}

export async function adminSignOutUserAction(
  userId: string
): Promise<{ error: string } | { success: true }> {
  const admin = await requireAdmin();
  if (!z.uuid().safeParse(userId).success)
    return { error: "Invalid user id." };

  const supabase = await createClient();
  const { data: revokedCount, error } = await supabase.rpc(
    "admin_revoke_user_sessions",
    { target_user: userId }
  );
  if (error) return { error: "Could not revoke sessions." };

  await writeAudit({
    action: "auth.sessions_revoked_all",
    actorId: admin.user.id,
    actorEmail: admin.profile.email,
    resourceType: "user",
    resourceId: userId,
    metadata: { sessions_revoked: revokedCount ?? 0 },
  });

  revalidatePath("/admin/users");
  return { success: true as const };
}
