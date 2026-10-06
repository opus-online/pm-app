import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { pipelineTotals } from "@/lib/sales/pipeline";
import { loadPipeline } from "./load-pipeline";
import { formatEur } from "./money";
import { PipelineKpis } from "./pipeline-kpis";
import { PipelineTable } from "./pipeline-table";
import { ViewToggle, type PipelineView } from "./view-toggle";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current) notFound();
  const supabase = await createClient();
  // Page gate mirrors the nav gate; the data itself is RLS-scoped on view_sales and every write
  // re-checks manage_sales server-side in actions/sales.ts.
  const [{ data: canView }, { data: canManage }] = await Promise.all([
    supabase.rpc("has_permission", { uid: current.user.id, perm: "view_sales" }),
    supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_sales" }),
  ]);
  if (canView !== true) notFound();

  const { view: viewParam } = await searchParams;
  const view: PipelineView = viewParam === "board" ? "board" : "list";
  // Task 9 adds loadSalesOwners() + loadCompanyOptions() here for the New lead dialog.
  const rows = await loadPipeline();
  const totals = pipelineTotals(rows);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Sales</h1>
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
            {totals.openCount} open deal{totals.openCount === 1 ? "" : "s"}
            <span className="mx-1.5 text-border">·</span>
            {formatEur(totals.pipelineValue)} pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} />
        </div>
      </div>

      <PipelineKpis rows={rows} />

      {/* Board view (PipelineBoard) lands in Task 8; until then both views render the list. */}
      <PipelineTable rows={rows} canManage={canManage === true} />
    </div>
  );
}
