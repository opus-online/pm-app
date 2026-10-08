"use client";

import { CalendarDays, ChevronDownIcon, XIcon } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDateEt } from "@/lib/sales/date-format";
import { OPEN_STAGES, type DealStage } from "@/lib/sales/types";
import { cn } from "@/lib/utils";
import { STAGE_DOT, STAGE_LABEL } from "./stage";
import type { SalesOwnerOption } from "./types";

export const ALL = "__all__";

export type StepFilter = typeof ALL | "with" | "without";

export type PipelineFilterState = {
  q: string;
  /** Companies with at least one open deal in this stage. */
  stage: DealStage | typeof ALL;
  step: StepFilter;
  /** Next step due on or after this ISO date (inclusive); "" = open. */
  from: string;
  /** Next step due on or before this ISO date (inclusive); "" = open. */
  to: string;
  /** Next step's assignee: anyone, nobody, or a user id. */
  responsible: typeof ALL | typeof NOBODY | string;
};

export const NOBODY = "nobody";

export const EMPTY_FILTERS: PipelineFilterState = {
  q: "", stage: ALL, step: ALL, from: "", to: "", responsible: ALL,
};

const STEP_LABEL: Record<StepFilter, string> = {
  [ALL]: "Any next step",
  with: "With next step",
  without: "Without next step",
};

export function hasActiveFilters(f: PipelineFilterState): boolean {
  return (
    f.q.trim() !== "" ||
    f.stage !== ALL ||
    f.step !== ALL ||
    f.from !== "" ||
    f.to !== "" ||
    f.responsible !== ALL
  );
}

/** "Any date", or "dd.mm.yyyy – dd.mm.yyyy" with an open end shown as "…". */
function rangeLabel(from: string, to: string): string {
  if (!from && !to) return "Any date";
  return `${from ? formatDateEt(from) : "…"} – ${to ? formatDateEt(to) : "…"}`;
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

function PersonOption({ person }: { person: SalesOwnerOption }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PersonAvatar name={person.name} avatarUrl={person.avatar_url} className="size-5 text-[8px]" />
      <span className="truncate">{person.name}</span>
    </span>
  );
}

function NobodyOption() {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="size-5 shrink-0 rounded-full border border-dashed border-muted-foreground/50" />
      Nobody
    </span>
  );
}

function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const active = from !== "" || to !== "";
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Next step date"
            className={cn(
              "flex h-8 items-center gap-1.5 border py-2 pr-2 pl-2.5 text-sm whitespace-nowrap tabular-nums transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
              chip(active)
            )}
          />
        }
      >
        <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
        {rangeLabel(from, to)}
        <ChevronDownIcon aria-hidden className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <div className="text-xs font-medium text-muted-foreground">Next step date</div>
        <div className="grid gap-1.5">
          <Label htmlFor="step-from">From</Label>
          <Input
            id="step-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => onChange(e.target.value, to)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="step-to">To</Label>
          <Input
            id="step-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => onChange(from, e.target.value)}
          />
        </div>
        {active && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange("", "")}>
            <XIcon /> Clear dates
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PipelineFilters({
  value,
  onChange,
  people,
}: {
  value: PipelineFilterState;
  onChange: (next: PipelineFilterState) => void;
  /** Who can be picked in the Responsible filter (Sales people, by name). */
  people: SalesOwnerOption[];
}) {
  const personById = new Map(people.map((p) => [p.id, p]));
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
      <DateRangeFilter
        from={value.from}
        to={value.to}
        onChange={(from, to) => onChange({ ...value, from, to })}
      />
      <FilterDivider />
      <Select value={value.responsible} onValueChange={(v) => set("responsible", (v as string | null) ?? ALL)}>
        <SelectTrigger className={chip(value.responsible !== ALL)} aria-label="Responsible">
          <SelectValue>
            {(v: string) => {
              if (v === ALL) return "Anyone responsible";
              if (v === NOBODY) return <NobodyOption />;
              const person = personById.get(v);
              return person ? <PersonOption person={person} /> : "Anyone responsible";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-52">
          <SelectItem value={ALL}>Anyone responsible</SelectItem>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <PersonOption person={p} />
            </SelectItem>
          ))}
          <SelectItem value={NOBODY}>
            <NobodyOption />
          </SelectItem>
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
