"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { budgetItemSchema, type BudgetItemInput } from "@/lib/validation/budget";
import { ensureProjectBudgetId } from "@/lib/budget-row";

type ActionResult = { error: string } | { success: true; id: number };

const COST_ITEM_TYPES = new Set(["planned_cost", "actual_cost"]);

/** Add a budget_items row (invoice/payment/change/planned_cost/actual_cost) to the project's
 * budget, creating the project-level budget row on first use. Gated by manage_budget for every
 * item type; cost-type rows (planned_cost/actual_cost) additionally require view_internal_cost --
 * a PM (manage_budget, no view_internal_cost) can add invoices/payments/changes but is blocked
 * before any DB work if they somehow submit a cost-type item (the UI never offers them the
 * option, but this is the real security boundary, not the missing option in a <Select>). */
export async function addBudgetItemAction(
  projectId: string,
  input: BudgetItemInput
): Promise<ActionResult> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };

  // Security boundary #1: throws "Not authorized" if the caller lacks manage_budget on this
  // project. Must run before any validation/DB work.
  const current = await requirePermission("manage_budget", projectId);

  const parsed = budgetItemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid entry." };

  // Security boundary #2: cost-type items hold internal money -- require view_internal_cost too.
  // Throws "Not authorized" for a PM who lacks it, same fail-hard behavior as boundary #1.
  if (COST_ITEM_TYPES.has(parsed.data.item_type)) {
    await requirePermission("view_internal_cost", projectId);
  }

  const supabase = await createClient();

  const budget = await ensureProjectBudgetId(supabase, projectId);
  if ("error" in budget) return budget;

  // created_by is set explicitly to match the RLS "insert budget items" WITH CHECK
  // (budget_items.created_by = auth.uid()) exactly, rather than relying on the column default.
  const { data: item, error } = await supabase
    .from("budget_items")
    .insert({ budget_id: budget.id, created_by: current.user.id, ...parsed.data })
    .select("id")
    .single();
  if (error || !item) return { error: "Save failed. Try again." };

  await writeAudit({
    action: "budget_item.added",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "budget_item",
    resourceId: String(item.id),
    metadata: {
      project_id: projectId,
      budget_id: budget.id,
      item_type: parsed.data.item_type,
      amount: parsed.data.amount,
    },
  });

  revalidatePath(`/projects/${projectId}/budget`);
  return { success: true as const, id: item.id };
}

export async function deleteBudgetItemAction(
  projectId: string,
  itemId: number
): Promise<{ error: string } | { success: true }> {
  if (!z.uuid().safeParse(projectId).success) return { error: "Invalid project." };
  if (!Number.isInteger(itemId) || itemId <= 0) return { error: "Invalid entry." };

  // Security boundary: throws "Not authorized" if the caller lacks manage_budget on this
  // project. Must run before any validation/DB work.
  const current = await requirePermission("manage_budget", projectId);

  const supabase = await createClient();

  // Defense in depth: confirm the item belongs to a budget under THIS project before deleting,
  // and re-check view_internal_cost for cost-type items -- mirrors addBudgetItemAction's second
  // boundary even though the "delete budget items" RLS policy itself only checks manage_budget
  // (a non-finance manage_budget holder is never shown a cost-type item to delete in the first
  // place, since the "view budget items" policy already withholds those rows from them).
  const { data: item } = await supabase
    .from("budget_items")
    .select("id, item_type, budget_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { error: "Entry not found." };

  const { data: budget } = await supabase
    .from("budgets")
    .select("project_id")
    .eq("id", item.budget_id)
    .maybeSingle();
  if (!budget || budget.project_id !== projectId) return { error: "Entry not found." };

  if (COST_ITEM_TYPES.has(item.item_type)) {
    await requirePermission("view_internal_cost", projectId);
  }

  const { error } = await supabase.from("budget_items").delete().eq("id", itemId);
  if (error) return { error: "Delete failed. Try again." };

  await writeAudit({
    action: "budget_item.deleted",
    actorId: current.user.id,
    actorEmail: current.profile.email,
    resourceType: "budget_item",
    resourceId: String(itemId),
    metadata: { project_id: projectId, item_type: item.item_type },
  });

  revalidatePath(`/projects/${projectId}/budget`);
  return { success: true as const };
}
