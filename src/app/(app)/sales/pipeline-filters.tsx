"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { OPEN_STAGES, type DealStage } from "@/lib/sales/types";
import { STAGE_DOT, STAGE_LABEL } from "./stage";

export const ALL = "__all__";

export type StepFilter = typeof ALL | "with" | "without";

export type PipelineFilterState = {
  q: string;
  /** Companies with at least one open deal in this stage. */
  stage: DealStage | typeof ALL;
  step: StepFilter;
};

export const EMPTY_FILTERS: PipelineFilterState = { q: "", stage: ALL, step: ALL };

const STEP_LABEL: Record<StepFilter, string> = {
  [ALL]: "Any next step",
  with: "With next step",
  without: "Without next step",
};

export function hasActiveFilters(f: PipelineFilterState): boolean {
  return f.q.trim() !== "" || f.stage !== ALL || f.step !== ALL;
}

/** Thin vertical rule between filter chips -- same separator as the projects filters. */
function FilterDivider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-border" />;
}

// Same chip language as the projects/clients filters: muted wash at rest, solid surface when active.
const chip = (active: boolean) =>
  active
    ? "rounded-full border-border bg-background shadow-xs"
    : "rounded-full border-transparent bg-muted/60 shadow-none";

function StageOption({ stage }: { stage: DealStage }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${STAGE_DOT[stage]}`} />
      {STAGE_LABEL[stage]}
    </span>
  );
}

export function PipelineFilters({
  value,
  onChange,
}: {
  value: PipelineFilterState;
  onChange: (next: PipelineFilterState) => void;
}) {
  const set = <K extends keyof PipelineFilterState>(key: K, v: PipelineFilterState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search companies, contacts or next steps…"
        aria-label="Search companies"
        value={value.q}
        onChange={(e) => set("q", e.target.value)}
        className="mr-3 w-84 rounded-full border-transparent bg-muted/60 shadow-none"
      />
      <Select
        value={value.stage}
        onValueChange={(v) => set("stage", (v as PipelineFilterState["stage"]) ?? ALL)}
      >
        <SelectTrigger className={chip(value.stage !== ALL)} aria-label="Deal stage">
          <SelectValue>
            {(v: string) => (v === ALL ? "All stages" : <StageOption stage={v as DealStage} />)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All stages</SelectItem>
          {OPEN_STAGES.map((s) => (
            <SelectItem key={s} value={s}>
              <StageOption stage={s} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FilterDivider />
      <Select value={value.step} onValueChange={(v) => set("step", (v as StepFilter) ?? ALL)}>
        <SelectTrigger className={chip(value.step !== ALL)} aria-label="Next step">
          <SelectValue>{(v: string) => STEP_LABEL[v as StepFilter]}</SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-48">
          {([ALL, "with", "without"] as const).map((s) => (
            <SelectItem key={s} value={s}>
              {STEP_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasActiveFilters(value) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="rounded-full bg-red-500/8 text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25"
        >
          <XIcon /> Clear filters
        </Button>
      )}
    </div>
  );
}
