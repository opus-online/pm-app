// Shared by the app's budget-item actions (src/app/actions/budget-items.ts) and the MCP project
// tools (src/lib/mcp/tools/projects.ts). Takes the caller's RLS-scoped client, so the "manage
// budgets" policy decides whether the row may be read/created.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Finds the project-level budget row (part_id is null) for a project, creating it on first use.
 * Every seeded project today only ever gets budget_items via this project-level row -- part-level
 * budgets (budgets.part_id set) exist in the schema but nothing in the app writes to them yet.
 * Caller must already hold manage_budget (checked by callers of this helper). */
export async function ensureProjectBudgetId(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<{ id: string } | { error: string }> {
  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("project_id", projectId)
    .is("part_id", null)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data: created, error } = await supabase
    .from("budgets")
    .insert({ project_id: projectId })
    .select("id")
    .single();
  if (error || !created) return { error: "Could not create the project budget." };
  return { id: created.id };
}
