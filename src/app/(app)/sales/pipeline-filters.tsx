"use client";

import { Archive, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PersonAvatar } from "@/components/person-avatar";
import { DEAL_SOURCES, DEAL_STAGES, OPEN_STAGES, type DealSource, type DealStage } from "@/lib/sales/types";
import { SOURCE_LABEL, STAGE_DOT, STAGE_LABEL } from "./stage";

export const ALL = "__all__";

export type PipelineFilterState = {
  q: string;
  stage: DealStage | typeof ALL;
  source: DealSource | typeof ALL;
  owner: string; // owner id or ALL
  closed: boolean;
};

export const EMPTY_FILTERS: PipelineFilterState = {
  q: "",
  stage: ALL,
  source: ALL,
  owner: ALL,
  closed: false,
};

export function hasActiveFilters(f: PipelineFilterState): boolean {
  return f.q.trim() !== "" || f.stage !== ALL || f.source !== ALL || f.owner !== ALL || f.closed;
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
  owners,
}: {
  value: PipelineFilterState;
  onChange: (next: PipelineFilterState) => void;
  owners: { id: string; name: string; avatar_url: string | null }[];
}) {
  const set = <K extends keyof PipelineFilterState>(key: K, v: PipelineFilterState[K]) =>
    onChange({ ...value, [key]: v });
  const stageOptions = value.closed ? DEAL_STAGES : OPEN_STAGES;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search companies, contacts or reg code…"
        value={value.q}
        onChange={(e) => set("q", e.target.value)}
        className="mr-3 w-84 rounded-full border-transparent bg-muted/60 shadow-none"
      />
      <Select
        value={value.stage}
        onValueChange={(v) => set("stage", (v as PipelineFilterState["stage"]) ?? ALL)}
      >
        <SelectTrigger className={chip(value.stage !== ALL)}>
          <SelectValue>
            {(v: string) => (v === ALL ? "All stages" : <StageOption stage={v as DealStage} />)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All stages</SelectItem>
          {stageOptions.map((s) => (
            <SelectItem key={s} value={s}>
              <StageOption stage={s} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FilterDivider />
      <Select
        value={value.source}
        onValueChange={(v) => set("source", (v as PipelineFilterState["source"]) ?? ALL)}
      >
        <SelectTrigger className={chip(value.source !== ALL)}>
          <SelectValue>
            {(v: string) => (v === ALL ? "All sources" : SOURCE_LABEL[v as DealSource])}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All sources</SelectItem>
          {DEAL_SOURCES.map((s) => (
            <SelectItem key={s} value={s}>
              {SOURCE_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {owners.length > 0 && (
        <>
          <FilterDivider />
          <Select value={value.owner} onValueChange={(v) => set("owner", v ?? ALL)}>
            <SelectTrigger className={chip(value.owner !== ALL)}>
              <SelectValue>
                {(v: string) => {
                  if (v === ALL) return "All owners";
                  const o = owners.find((x) => x.id === v);
                  return (
                    <span className="flex items-center gap-2">
                      <PersonAvatar name={o?.name} avatarUrl={o?.avatar_url} className="size-5 text-[9px]" />
                      {o?.name ?? "Unknown"}
                    </span>
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-52">
              <SelectItem value={ALL}>All owners</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  <span className="flex items-center gap-2">
                    <PersonAvatar name={o.name} avatarUrl={o.avatar_url} className="size-5 text-[9px]" />
                    {o.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
      <FilterDivider />
      <Button
        variant="outline"
        aria-pressed={value.closed}
        onClick={() =>
          onChange({
            ...value,
            closed: !value.closed,
            // Hiding closed deals drops a won/lost stage pick that could no longer match anything.
            stage: value.closed && value.stage !== ALL && !OPEN_STAGES.includes(value.stage) ? ALL : value.stage,
          })
        }
        className={`font-normal ${chip(value.closed)}`}
      >
        <Archive className="text-muted-foreground" />
        Show closed
      </Button>
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
