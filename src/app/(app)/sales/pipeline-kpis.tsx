import { Euro, Trophy } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { pipelineTotals } from "@/lib/sales/pipeline";
import { formatEur } from "./money";
import { StepsDueCard } from "./steps-due-card";
import type { PipelineRow } from "./types";

export function PipelineKpis({
  rows,
  stepsDueMine,
  stepsDueAll,
}: {
  rows: PipelineRow[];
  /** Due steps assigned to the viewer / to anyone. */
  stepsDueMine: number;
  stepsDueAll: number;
}) {
  const t = pipelineTotals(rows);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        icon={Euro}
        label="Pipeline"
        value={formatEur(t.pipelineValue)}
        iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
      />
      <StepsDueCard mine={stepsDueMine} all={stepsDueAll} />
      <StatCard
        icon={Trophy}
        label="Won this month"
        value={formatEur(t.wonThisMonthValue)}
        iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      />
    </div>
  );
}
