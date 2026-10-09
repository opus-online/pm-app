import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.signup"
  | "auth.session_revoked"
  | "auth.sessions_revoked_all"
  | "user.approved"
  | "user.created"
  | "user.status_changed"
  | "user.role_changed"
  | "project.created"
  | "project.updated"
  | "project.status_posted"
  | "project.status_update_edited"
  | "project.status_update_deleted"
  | "project.archived"
  | "project.deleted"
  | "milestone.toggled"
  | "part.upserted"
  | "part.deleted"
  | "part_billing.updated"
  | "part_costs.updated"
  | "budget_item.added"
  | "budget_item.deleted"
  | "member.added"
  | "member.updated"
  | "member.removed"
  | "link.upserted"
  | "link.deleted"
  | "credential.added"
  | "credential.updated"
  | "credential.deleted"
  | "credential.revealed"
  | "credential.copied"
  | "time.logged"
  | "time.updated"
  | "time.deleted"
  | "person.created"
  | "person.updated"
  | "person.deleted"
  | "person_skill.added"
  | "person_skill.removed"
  | "time_off.upserted"
  | "time_off.deleted"
  | "managed_option.created"
  | "managed_option.deleted"
  | "client.created"
  | "client.updated"
  | "client.deleted"
  | "delegation.created"
  | "delegation.revoked"
  | "access.granted"
  | "access.revoked"
  | "user.sales_access_changed"
  | "deal.created"
  | "deal.updated"
  | "deal.deleted"
  | "offer.saved"
  | "offer.deleted"
  | "company.saved";

export type AuditEntry = {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

/** Append to audit_logs via service role. Never throws — auditing must not break the flow. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  await writeAuditStrict(entry);
}

/**
 * Same insert as writeAudit, but reports success/failure instead of swallowing it. For flows
 * where "every action is audited" is a hard invariant (e.g. credential reveal), the caller must
 * be able to withhold the sensitive result when the audit write itself fails -- writeAudit's
 * fire-and-forget semantics can't support that, since a caller can never tell whether its insert
 * actually landed.
 */
export async function writeAuditStrict(entry: AuditEntry): Promise<boolean> {
  try {
    const h = await headers();
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      action: entry.action,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: h.get("user-agent") ?? null,
      metadata: (entry.metadata ?? {}) as never,
    });
    if (error) {
      console.error("audit write failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("audit write failed:", e);
    return false;
  }
}
