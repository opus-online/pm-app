"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { generateKey } from "@/lib/mcp/keys";
import { createMcpKeySchema, type CreateMcpKeyInput } from "@/lib/validation/mcp";

type CreateResult = { error: string } | { success: true; key: string; id: string };
type RevokeResult = { error: string } | { success: true };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Settings → AI assistant → "Create key". Spec:
 * docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md (Key format & storage, Expiry).
 * Only `sha256(key)` and a display prefix are ever persisted (via generateKey()); the full key
 * is returned once, in this action's response, and never written anywhere. The insert goes
 * through the user's own cookie-scoped client, so the "insert own mcp_keys" RLS policy (user_id
 * = auth.uid(), expires_at within 1..366 days, revoked/used columns all null) is the real
 * backstop -- this action just maps its failure to a friendly message.
 */
export async function createMcpKeyAction(input: CreateMcpKeyInput): Promise<CreateResult> {
  const current = await requireActiveUser();

  const parsed = createMcpKeySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid key request." };
  const { label, days } = parsed.data;

  const { key, hash, prefix } = generateKey();
  const expiresAt = new Date(Date.now() + days * DAY_MS).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcp_keys")
    .insert({
      user_id: current.user.id,
      label,
      key_hash: hash,
      key_prefix: prefix,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the key. Try again." };

  await writeAudit({
    action: "mcp_key.created",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "mcp_key",
    resourceId: data.id,
    metadata: { label, days, key_prefix: prefix },
  });

  revalidatePath("/settings");
  return { success: true, key, id: data.id };
}

/**
 * Revokes a key -- the owner from Settings → AI assistant, or an admin from User access (admins
 * can revoke any key per the design's "Admins see and can revoke all keys on User access", backed
 * by the `is_admin()` branch of the "update own mcp_keys" RLS policy). No ownership check here:
 * the update's `.eq("id", id)` either matches a row RLS lets this caller see and touch, or it
 * matches nothing, and the two are handled identically (a friendly "not found"). The
 * `mcp_keys_guard_revocation` trigger stamps `revoked_at`/`revoked_by` itself (now(), auth.uid())
 * and makes the transition permanent -- this just has to supply a non-null `revoked_at` to flip
 * the trigger's branch; it does not matter what value, since the trigger overwrites it.
 */
export async function revokeMcpKeyAction(id: string): Promise<RevokeResult> {
  if (!z.uuid().safeParse(id).success) return { error: "Invalid key." };

  const current = await requireActiveUser();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcp_keys")
    .update({ revoked_at: new Date().toISOString(), revoked_by: current.user.id })
    .eq("id", id)
    .is("revoked_at", null)
    .select("user_id")
    .maybeSingle();
  if (error) return { error: "Could not revoke the key. Try again." };
  if (!data) return { error: "Key not found." };

  await writeAudit({
    action: "mcp_key.revoked",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "mcp_key",
    resourceId: id,
    metadata: { owner_id: data.user_id },
  });

  revalidatePath("/settings");
  revalidatePath("/admin/access");
  return { success: true as const };
}
