"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { consentProblem } from "@/lib/mcp/oauth-consent";
import { clientRedirectsAllowed } from "@/lib/mcp/oauth-client-check";

// claude.ai connector (OAuth) actions. Spec: docs/superpowers/specs/2026-10-14-claude-connector-oauth-design.md

type UrlResult = { error: string } | { url: string };
type DisconnectResult = { error: string } | { success: true };

const authorizationIdSchema = z.string().trim().min(1).max(200);
const EXPIRED = "This connection request has expired. Start again from Claude.";

/** Consent page → Allow. Re-reads the authorization server-side (never trusts client-sent
 * client ids), checks it belongs to this user and an allowed app, records the connection with the
 * chosen access, then approves it at Supabase and returns Claude's callback URL. */
export async function approveConnectionAction(input: { authorizationId: string; canWrite: boolean }): Promise<UrlResult> {
  const id = authorizationIdSchema.safeParse(input.authorizationId);
  if (!id.success || typeof input.canWrite !== "boolean") return { error: EXPIRED };
  const current = await requireActiveUser();
  const supabase = await createClient();

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(id.data);
  if (error || !details || !("authorization_id" in details)) return { error: EXPIRED };
  const problem = consentProblem(details, current.user.id);
  if (problem) return { error: problem };
  if (!(await clientRedirectsAllowed(details.client.id))) return { error: "This app isn't allowed to connect to PM app." };

  const clientName = details.client.name?.trim() || "Unknown app";
  const { data: connectionId, error: connectError } = await supabase.rpc("mcp_connect", {
    p_client_id: details.client.id,
    p_client_name: clientName,
    p_can_write: input.canWrite,
  });
  if (connectError || !connectionId) return { error: "Could not save the connection. Try again." };

  const { data: approved, error: approveError } = await supabase.auth.oauth.approveAuthorization(id.data, {
    skipBrowserRedirect: true,
  });
  if (approveError || !approved) {
    await supabase.rpc("mcp_disconnect", { p_id: connectionId });
    return { error: EXPIRED };
  }

  await writeAudit({
    action: "mcp_connection.created",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "mcp_connection",
    resourceId: connectionId,
    metadata: { client_id: details.client.id, client_name: clientName, can_write: input.canWrite },
  });
  revalidatePath("/settings");
  return { url: approved.redirect_url };
}

/** Consent page → Deny: tells Supabase, returns Claude's callback URL (with the error). */
export async function denyConnectionAction(authorizationId: string): Promise<UrlResult> {
  const id = authorizationIdSchema.safeParse(authorizationId);
  if (!id.success) return { error: EXPIRED };
  await requireActiveUser();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(id.data, { skipBrowserRedirect: true });
  if (error || !data) return { error: EXPIRED };
  return { url: data.redirect_url };
}

/** Settings → Connected apps → Disconnect (own connections only, enforced by mcp_disconnect).
 * Our row is the gate (endpoint refuses at once); revoking the Supabase grant as well kills the
 * client's refresh tokens and makes a reconnect ask for consent again -- best effort. */
export async function disconnectConnectionAction(id: string): Promise<DisconnectResult> {
  if (!z.uuid().safeParse(id).success) return { error: "Invalid connection." };
  const current = await requireActiveUser();
  const supabase = await createClient();

  const { data: clientId, error } = await supabase.rpc("mcp_disconnect", { p_id: id });
  if (error) return { error: "Could not disconnect. Try again." };
  if (!clientId) return { error: "Connection not found." };

  const { error: revokeError } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (revokeError) console.error("mcp revokeGrant failed:", revokeError.message);

  await writeAudit({
    action: "mcp_connection.revoked",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "mcp_connection",
    resourceId: id,
    metadata: { client_id: clientId },
  });
  revalidatePath("/settings");
  revalidatePath("/admin/users");
  return { success: true as const };
}
