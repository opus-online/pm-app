"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { writeAudit } from "@/lib/audit";
import { normalizeRegCode } from "@/lib/sales/reg-code";
import {
  activitySchema,
  companySchema,
  contactSchema,
  dealUpdateSchema,
  newLeadSchema,
  offerSchema,
  type ActivityInput,
  type CompanyInput,
  type ContactInput,
  type DealUpdateInput,
  type NewLeadInput,
  type OfferInput,
} from "@/lib/validation/sales";

type Result = { error: string } | { success: true };

const isUuid = (v: unknown) => z.uuid().safeParse(v).success;

function revalidateSales(clientId?: string) {
  revalidatePath("/sales");
  if (clientId) revalidatePath(`/sales/companies/${clientId}`);
}

async function existingByRegCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  regCode: string | null,
  exceptId?: string | null
) {
  const norm = normalizeRegCode(regCode);
  if (!norm) return null;
  const { data } = await supabase.from("clients").select("id, name, reg_code").not("reg_code", "is", null);
  return (data ?? []).find((c) => normalizeRegCode(c.reg_code) === norm && c.id !== exceptId) ?? null;
}

export async function findCompanyByRegCodeAction(regCode: string): Promise<{ id: string; name: string } | null> {
  await requirePermission("view_sales");
  const supabase = await createClient();
  const hit = await existingByRegCode(supabase, regCode);
  return hit ? { id: hit.id, name: hit.name } : null;
}

export async function createLeadAction(
  input: NewLeadInput
): Promise<{ error: string; existingClientId?: string } | { success: true; clientId: string; dealId: string }> {
  const current = await requirePermission("manage_sales");

  // Ruling: if attaching to an existing company, stale new-company fields (e.g. left over from a
  // form toggle) must not block the submission with validation errors for fields that are moot.
  const raw = input.client_id ? { ...input, company: undefined } : input;

  const parsed = newLeadSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid lead." };
  const supabase = await createClient();
  const { client_id, company, deal, contact } = parsed.data;

  if (!client_id) {
    const dup = await existingByRegCode(supabase, company?.reg_code ?? null);
    if (dup) return { error: `Already exists: ${dup.name}`, existingClientId: dup.id };
  }

  const { data, error } = await supabase.rpc("create_lead", {
    // The SQL function accepts a null p_client_id (new company path); the generated RPC Args
    // type doesn't reflect that nullability, hence the cast.
    p_client_id: client_id as never,
    p_company: (company ?? {}) as never,
    p_deal: deal as never,
    p_contact: (contact?.first_name ? contact : null) as never,
  });
  if (error) {
    return error.code === "23505"
      ? { error: "A company with this registry code already exists." }
      : { error: "Could not create the lead. Try again." };
  }

  const { client_id: clientId, deal_id: dealId } = data as { client_id: string; deal_id: string };
  await writeAudit({
    action: "deal.created",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "deal",
    resourceId: dealId,
    metadata: { client_id: clientId },
  });
  revalidateSales(clientId);
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { success: true as const, clientId, dealId };
}

export async function updateDealAction(dealId: string, input: DealUpdateInput): Promise<Result> {
  if (!isUuid(dealId)) return { error: "Invalid deal." };
  const current = await requirePermission("manage_sales");

  const parsed = dealUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid deal." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .update(parsed.data)
    .eq("id", dealId)
    .select("client_id")
    .single();
  if (error) {
    if (error.code === "23514") return { error: "Give a reason for losing the deal." };
    return { error: "Save failed. Try again." };
  }

  await writeAudit({
    action: "deal.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "deal",
    resourceId: dealId,
    metadata: { client_id: data.client_id },
  });
  revalidateSales(data.client_id);
  return { success: true as const };
}

export async function deleteDealAction(dealId: string): Promise<Result> {
  if (!isUuid(dealId)) return { error: "Invalid deal." };
  const current = await requirePermission("manage_sales");

  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("client_id").eq("id", dealId).single();

  const { error } = await supabase.from("deals").delete().eq("id", dealId);
  if (error) return { error: "Delete failed. Try again." };

  await writeAudit({
    action: "deal.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "deal",
    resourceId: dealId,
    metadata: { client_id: deal?.client_id ?? null },
  });
  revalidateSales(deal?.client_id);
  return { success: true as const };
}

export async function saveOfferAction(
  dealId: string,
  input: OfferInput,
  offerId?: string | null
): Promise<Result> {
  if (!isUuid(dealId)) return { error: "Invalid deal." };
  if (offerId && !isUuid(offerId)) return { error: "Invalid offer." };
  const current = await requirePermission("manage_sales");

  const parsed = offerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid offer." };

  const supabase = await createClient();
  const write = offerId
    ? supabase.from("offers").update(parsed.data).eq("id", offerId)
    : supabase.from("offers").insert({ ...parsed.data, deal_id: dealId });
  const { data, error } = await write.select("id, deal_id").single();
  if (error || !data) return { error: "Save failed. Try again." };

  const { data: deal } = await supabase.from("deals").select("client_id").eq("id", data.deal_id).single();

  await writeAudit({
    action: "offer.saved",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "offer",
    resourceId: data.id,
    metadata: { deal_id: data.deal_id },
  });
  revalidateSales(deal?.client_id);
  return { success: true as const };
}

export async function deleteOfferAction(offerId: string): Promise<Result> {
  if (!isUuid(offerId)) return { error: "Invalid offer." };
  const current = await requirePermission("manage_sales");

  const supabase = await createClient();
  const { data: offer } = await supabase.from("offers").select("deal_id").eq("id", offerId).single();

  const { error } = await supabase.from("offers").delete().eq("id", offerId);
  if (error) return { error: "Delete failed. Try again." };

  let clientId: string | undefined;
  if (offer?.deal_id) {
    const { data: deal } = await supabase.from("deals").select("client_id").eq("id", offer.deal_id).single();
    clientId = deal?.client_id;
  }

  await writeAudit({
    action: "offer.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "offer",
    resourceId: offerId,
    metadata: { deal_id: offer?.deal_id ?? null },
  });
  revalidateSales(clientId);
  return { success: true as const };
}

export async function logActivityAction(input: ActivityInput): Promise<Result> {
  const current = await requirePermission("manage_sales");

  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid activity." };
  const { client_id, deal_id, contact_id, kind, body, occurred_at, set_follow_up_on } = parsed.data;

  const supabase = await createClient();

  // Ruling: deal_id/contact_id must belong to the same client_id, or a user could log an activity
  // against another company's deal/contact by id.
  if (deal_id) {
    const { data: deal } = await supabase.from("deals").select("client_id").eq("id", deal_id).single();
    if (!deal || deal.client_id !== client_id) {
      return { error: "That deal/contact belongs to another company." };
    }
  }
  if (contact_id) {
    const { data: contact } = await supabase.from("client_contacts").select("client_id").eq("id", contact_id).single();
    if (!contact || contact.client_id !== client_id) {
      return { error: "That deal/contact belongs to another company." };
    }
  }

  // Never send actor_id: the DB default is auth.uid() and RLS pins it -- sending our own value
  // (even the correct one) is unnecessary and risks future drift from the RLS check.
  const { data, error } = await supabase
    .from("crm_activities")
    .insert({ client_id, deal_id: deal_id ?? null, contact_id: contact_id ?? null, kind, body, occurred_at })
    .select("id")
    .single();
  if (error || !data) return { error: "Save failed. Try again." };

  if (set_follow_up_on && deal_id) {
    await supabase.from("deals").update({ next_follow_up_on: set_follow_up_on }).eq("id", deal_id);
  }

  await writeAudit({
    // Reusing company.saved -- every activity hangs off a client_id (not every one has a
    // deal_id), so "deal.updated" would misrepresent plain note/call/email/meeting logs.
    action: "company.saved",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "crm_activity",
    resourceId: data.id,
    metadata: { client_id, deal_id, kind },
  });
  revalidateSales(client_id);
  return { success: true as const };
}

export async function deleteActivityAction(activityId: string): Promise<Result> {
  if (!isUuid(activityId)) return { error: "Invalid activity." };
  const current = await requirePermission("manage_sales");

  const supabase = await createClient();
  const { data: activity } = await supabase.from("crm_activities").select("client_id").eq("id", activityId).single();

  const { error } = await supabase.from("crm_activities").delete().eq("id", activityId);
  if (error) return { error: "Delete failed. Try again." };

  await writeAudit({
    action: "company.saved",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "crm_activity",
    resourceId: activityId,
    metadata: { client_id: activity?.client_id ?? null, deleted: true },
  });
  revalidateSales(activity?.client_id);
  return { success: true as const };
}

export async function saveCompanyAction(
  input: CompanyInput,
  clientId?: string | null
): Promise<{ error: string; existingClientId?: string } | { success: true; id: string }> {
  if (clientId && !isUuid(clientId)) return { error: "Invalid company." };
  const current = await requirePermission("manage_sales");

  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid company." };

  const supabase = await createClient();
  const dup = await existingByRegCode(supabase, parsed.data.reg_code, clientId);
  if (dup) return { error: `Already exists: ${dup.name}`, existingClientId: dup.id };

  const write = clientId
    ? supabase.from("clients").update(parsed.data).eq("id", clientId)
    : supabase.from("clients").insert(parsed.data);
  const { data, error } = await write.select("id").single();
  if (error || !data) {
    return error?.code === "23505"
      ? { error: "A company with this registry code already exists." }
      : { error: "Save failed. Try again." };
  }

  await writeAudit({
    action: "company.saved",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "client",
    resourceId: data.id,
    metadata: { name: parsed.data.name },
  });
  revalidateSales(data.id);
  revalidatePath("/clients");
  revalidatePath(`/clients/${data.id}`);
  return { success: true as const, id: data.id };
}

export async function saveContactAction(
  clientId: string,
  input: ContactInput,
  contactId?: string | null
): Promise<Result> {
  if (!isUuid(clientId)) return { error: "Invalid company." };
  if (contactId && !isUuid(contactId)) return { error: "Invalid contact." };
  const current = await requirePermission("manage_sales");

  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid contact." };

  const supabase = await createClient();
  // client_contacts.name is derived by trigger from first_name/last_name; the insert still needs
  // a value to satisfy the NOT NULL column ahead of the trigger firing.
  const row = { client_id: clientId, name: "", ...parsed.data };
  const write = contactId
    ? supabase.from("client_contacts").update(row).eq("id", contactId)
    : supabase.from("client_contacts").insert(row);
  const { error } = await write;
  if (error) return { error: "Save failed. Try again." };

  await writeAudit({
    action: "company.saved",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "client_contact",
    resourceId: contactId ?? clientId,
    metadata: { client_id: clientId, contact_id: contactId ?? null },
  });
  revalidateSales(clientId);
  // client_contacts also backs /clients and /clients/[id] (shared with the general Clients
  // module), so a contact add/edit here must refresh those too.
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { success: true as const };
}

export async function deleteContactAction(contactId: string): Promise<Result> {
  if (!isUuid(contactId)) return { error: "Invalid contact." };
  const current = await requirePermission("manage_sales");

  const supabase = await createClient();
  const { data: contact } = await supabase.from("client_contacts").select("client_id").eq("id", contactId).single();

  const { error } = await supabase.from("client_contacts").delete().eq("id", contactId);
  if (error) return { error: "Delete failed. Try again." };

  await writeAudit({
    action: "company.saved",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "client_contact",
    resourceId: contactId,
    metadata: { client_id: contact?.client_id ?? null, deleted: true },
  });
  revalidateSales(contact?.client_id);
  revalidatePath("/clients");
  if (contact?.client_id) revalidatePath(`/clients/${contact.client_id}`);
  return { success: true as const };
}

export async function linkDealProjectAction(dealId: string, projectId: string): Promise<Result> {
  if (!isUuid(dealId) || !isUuid(projectId)) return { error: "Invalid reference." };
  const current = await requirePermission("manage_sales");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .update({ project_id: projectId })
    .eq("id", dealId)
    .select("client_id")
    .single();
  if (error) return { error: "Save failed. Try again." };

  await writeAudit({
    action: "deal.updated",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "deal",
    resourceId: dealId,
    metadata: { client_id: data.client_id, project_id: projectId },
  });
  revalidateSales(data.client_id);
  return { success: true as const };
}
