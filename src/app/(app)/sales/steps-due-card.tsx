"use client";

import { BellRing } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useStepsDueScope, type StepsDueScope } from "./use-steps-due-scope";

const ITEM = "h-6 px-2 text-xs aria-pressed:bg-muted aria-pressed:text-foreground";

/** Steps due KPI tile (same look as StatCard) with a Me | All switch; both counts come from the
 * server, the choice is remembered per browser. */
export function StepsDueCard({ mine, all }: { mine: number; all: number }) {
  const [scope, setScope] = useStepsDueScope();
  const count = scope === "me" ? mine : all;
  const due = count > 0;
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            due ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-muted text-muted-foreground"
          )}
        >
          <BellRing className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">Steps due</p>
          <p className="text-xl leading-tight font-semibold tabular-nums">{count}</p>
          <p className={cn("truncate text-xs", due ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
            today or overdue
          </p>
        </div>
        <ToggleGroup
          value={[scope]}
          onValueChange={(v: string[]) => v[0] && setScope(v[0] as StepsDueScope)}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Whose steps"
          className="shrink-0 self-start"
        >
          <ToggleGroupItem value="me" className={ITEM}>
            Me
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className={ITEM}>
            All
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}
