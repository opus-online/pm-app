"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { clientSchema, type ClientInput } from "@/lib/validation/client";

type UpsertResult = { error: string } | { success: true; id: string; name: string };

export async function upsertClientAction(
  input: ClientInput,
  clientId?: string | null
): Promise<UpsertResult> {
  if (clientId && !z.uuid().safeParse(clientId).success) return { error: "Invalid client." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_clients (global,
  // no project scope -- clients are a shared directory like people). Must run before any
  // validation/DB work.
  const current = await requirePermission("manage_clients");

  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid client details." };

  // Exactly one primary among the submitted contacts: first row flagged primary wins, else the
  // first row. Server-side normalization -- the form enforces the same rule but isn't trusted.
  const primaryIndex = Math.max(0, parsed.data.contacts.findIndex((c) => c.is_primary));
  const contacts = parsed.data.contacts.map((c, i) => ({ ...c, is_primary: i === primaryIndex }));
  const primary = contacts[primaryIndex] ?? null;
  // first_name is required per row, so this is never empty when a primary exists.
  const primaryName = primary ? [primary.first_name, primary.last_name].filter(Boolean).join(" ") : null;

  const supabase = await createClient();
  // Legacy clients.contact_name/contact_email stay synced from the primary contact -- views/pages
  // elsewhere (projects list, budgets) still read them. clients.phone is NOT synced: it is the
  // company phone, edited in Sales.
  const clientRow = {
    name: parsed.data.name,
    reg_code: parsed.data.reg_code,
    email: parsed.data.email,
    website: parsed.data.website,
    notes: parsed.data.notes,
    contact_name: primaryName,
    contact_email: primary?.email ?? null,
  };
  const write = clientId
    ? supabase.from("clients").update(clientRow).eq("id", clientId)
    : supabase.from("clients").insert(clientRow);
  const { data: client, error } = await write.select("id, name").single();
  if (error || !client) {
    // reg_code is unique case/space-insensitively (DB functional unique index) -- 23505 is the
    // only way this insert/update fails on bad input, so no separate pre-check is needed.
    return error?.code === "23505"
      ? { error: "A company with this registry code already exists." }
      : { error: "Save failed. Try again." };
  }

  if (clientId) {
    // Id-matched sync, NOT delete+reinsert: a fresh row id on every save would silently null out
    // crm_activities.contact_id and projects.client_contact_id, which point at a specific
    // client_contacts row (bug found in review -- the old code deleted and reinserted every
    // contact on every client save, new ids and all). A row with a submitted `id` is updated in
    // place; a row with no `id` is a new contact and gets inserted; any existing row whose id
    // was NOT resubmitted (the user removed it in the form) gets deleted. RLS ("manage
    // client_contacts" = manage_clients) is the real backstop; `.eq("client_id", client.id)` on
    // the update additionally guards against an id for a *different* client's contact being
    // submitted.
    const existing = contacts.filter((c): c is typeof c & { id: string } => !!c.id);
    const toInsert = contacts.filter((c) => !c.id);
    const submittedIds = new Set(existing.map((c) => c.id));

    const { data: beforeRows, error: beforeError } = await supabase
      .from("client_contacts")
      .select("id")
      .eq("client_id", client.id);
    if (beforeError) return { error: "Save failed. Try again." };
    const toDeleteIds = (beforeRows ?? []).map((r) => r.id).filter((id) => !submittedIds.has(id));

    // Only the fields this form edits -- gender/description are deliberately left out of the
    // update payload (unlike the insert below) so a concurrent edit via the Sales contact dialog
    // isn't overwritten by a client-form save that never touched those fields.
    for (const c of existing) {
      const { error: updateError } = await supabase
        .from("client_contacts")
        .update({
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          phone: c.phone,
          role: c.role,
          is_primary: c.is_primary,
        })
        .eq("id", c.id)
        .eq("client_id", client.id);
      if (updateError) return { error: "Save failed. Try again." };
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("client_contacts").insert(
        toInsert.map((c) => ({
          client_id: client.id,
          name: "", // trigger derives this from first_name/last_name
          first_name: c.first_name,
          last_name: c.last_name,
          gender: c.gender,
          description: c.description,
          email: c.email,
          phone: c.phone,
          role: c.role,
          is_primary: c.is_primary,
        }))
      );
      if (insertError) return { error: "Save failed. Try again." };
    }

    if (toDeleteIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("client_contacts")
        .delete()
        .eq("client_id", client.id)
        .in("id", toDeleteIds);
      if (deleteError) return { error: "Save failed. Try again." };
    }
  } else if (contacts.length > 0) {
    // Create path: no existing rows to reconcile against, so every submitted contact is new.
    const { error: contactsError } = await supabase.from("client_contacts").insert(
      contacts.map((c) => ({
        client_id: client.id,
        name: "", // trigger derives this from first_name/last_name
        first_name: c.first_name,
        last_name: c.last_name,
        gender: c.gender,
        description: c.description,
        email: c.email,
        phone: c.phone,
        role: c.role,
        is_primary: c.is_primary,
      }))
    );
    if (contactsError) return { error: "Save failed. Try again." };
  }

  await writeAudit({
    action: clientId ? "client.updated" : "client.created",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "client",
    resourceId: client.id,
    metadata: { name: client.name, contact_count: contacts.length },
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${client.id}`);
  revalidatePath("/projects/new");
  return { success: true as const, id: client.id, name: client.name };
}

/**
 * Refuses to delete a client that has any projects referencing it, rather than checking via an
 * RLS'd select (which could undercount for a caller who can't see every project) -- the
 * `projects.client_id` foreign key carries no ON DELETE clause, so Postgres defaults to RESTRICT
 * and raises 23503 (foreign_key_violation) regardless of the caller's row-visibility. That DB
 * constraint is the real backstop (mirrors how `people_prevent_delete_with_history` backstops
 * deletePersonAction); this handler just turns the raw FK error into a friendly message.
 */
export async function deleteClientAction(clientId: string): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(clientId).success) return { error: "Invalid client." };

  const current = await requirePermission("manage_clients");

  const supabase = await createClient();

  // Capture the name before deletion for the audit trail (the row is gone afterward).
  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).single();

  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) {
    if (error.code === "23503") {
      return { error: "This client has projects — reassign or archive them first." };
    }
    return { error: "Delete failed. Try again." };
  }

  await writeAudit({
    action: "client.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "client",
    resourceId: clientId,
    metadata: { name: client?.name ?? null },
  });

  revalidatePath("/clients");
  revalidatePath("/projects/new");
  return { success: true as const };
}
