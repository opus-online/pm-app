import { notFound } from "next/navigation";
import { pipelineTotals } from "@/lib/sales/pipeline";
import { getSalesAccess } from "./access";
import { CompaniesTable } from "./companies-table";
import { loadCompanies } from "./load-companies";
import { loadCompanyOptions, loadPipeline, loadPlannedStepDates, loadSalesOwners } from "./load-pipeline";
import { NewLeadDialog } from "./new-lead-dialog";
import { formatEur } from "./money";
import { PipelineBoard } from "./pipeline-board";
import { PipelineKpis } from "./pipeline-kpis";
import { ViewToggle, type PipelineView } from "./view-toggle";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  // sales/layout.tsx already 404s without view_sales; re-checked here (request-cached, free) as
  // defense in depth. Data is RLS-scoped on view_sales and every write re-checks manage_sales.
  const access = await getSalesAccess();
  if (!access?.canView) notFound();
  const { current, canManage } = access;

  const { view: viewParam } = await searchParams;
  const view: PipelineView = viewParam === "board" ? "board" : "list";
  const manage = canManage;
  // Companies drive the list, deals the board and the money KPIs, every planned step the Steps
  // due KPI. The dialog's pickers are only loaded for users who can create leads.
  const [companies, rows, steps, owners, companyOptions] = await Promise.all([
    loadCompanies(),
    loadPipeline(),
    loadPlannedStepDates(),
    manage ? loadSalesOwners() : Promise.resolve([]),
    manage ? loadCompanyOptions() : Promise.resolve([]),
  ]);
  const totals = pipelineTotals(rows);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Sales</h1>
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
            {companies.length} compan{companies.length === 1 ? "y" : "ies"}
            <span className="mx-1.5 text-border">·</span>
            {totals.openCount} open deal{totals.openCount === 1 ? "" : "s"}
            <span className="mx-1.5 text-border">·</span>
            {formatEur(totals.pipelineValue)} pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} />
          {manage && (
            <NewLeadDialog companies={companyOptions} owners={owners} currentUserId={current.user.id} />
          )}
        </div>
      </div>

      <PipelineKpis rows={rows} steps={steps} />

      {view === "board" ? (
        <PipelineBoard rows={rows} canManage={manage} />
      ) : (
        <CompaniesTable rows={companies} />
      )}
    </div>
  );
}
