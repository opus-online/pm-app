import { BellRing, Briefcase, Euro, Trophy } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { pipelineTotals } from "@/lib/sales/pipeline";
import { formatEur } from "./money";
import type { PipelineRow } from "./types";

const NEUTRAL_ICON = "bg-muted text-muted-foreground";

export function PipelineKpis({ rows, stepsDue }: { rows: PipelineRow[]; stepsDue: number }) {
  const t = pipelineTotals(rows);
  const due = stepsDue > 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={Briefcase}
        label="Open deals"
        value={String(t.openCount)}
        iconClass="bg-sky-500/10 text-sky-600 dark:text-sky-400"
      />
      <StatCard
        icon={Euro}
        label="Pipeline"
        value={formatEur(t.pipelineValue)}
        iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
      />
      <StatCard
        icon={BellRing}
        label="Steps due"
        value={String(stepsDue)}
        iconClass={due ? "bg-red-500/10 text-red-600 dark:text-red-400" : NEUTRAL_ICON}
        context="today or overdue"
        contextClass={due ? "text-red-700 dark:text-red-400" : undefined}
      />
      <StatCard
        icon={Trophy}
        label="Won this month"
        value={formatEur(t.wonThisMonthValue)}
        iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      />
    </div>
  );
}
