"use client";

import { PersonAvatar } from "@/components/person-avatar";
import type { NextStep } from "@/lib/sales/next-step";
import { cn } from "@/lib/utils";
import { KIND_META } from "./activity-kind";
import { DueChip } from "./due-chip";
import { TruncateTooltip } from "./truncate-tooltip";

/** The company's earliest planned step on one line: due chip · kind icon · text · assignee. */
export function NextStepCell({ step }: { step: NextStep | null }) {
  if (!step) return <span className="text-sm text-muted-foreground">—</span>;
  const meta = KIND_META[step.kind];
  const Icon = meta.icon;
  return (
    <div className="flex max-w-md min-w-0 items-center gap-2">
      <DueChip date={step.due_on} className="shrink-0" />
      <span
        role="img"
        aria-label={meta.label}
        className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", meta.circle)}
      >
        <Icon className="size-3.5" />
      </span>
      <TruncateTooltip text={step.body} className="flex-1 text-sm" />
      {step.assignee && (
        <span className="flex max-w-36 shrink-0 items-center gap-1.5" aria-label={`Assignee: ${step.assignee.name}`}>
          <PersonAvatar
            name={step.assignee.name}
            avatarUrl={step.assignee.avatar_url}
            className="size-6 text-[10px]"
          />
          <TruncateTooltip text={step.assignee.name} className="text-sm text-muted-foreground" />
        </span>
      )}
    </div>
  );
}
