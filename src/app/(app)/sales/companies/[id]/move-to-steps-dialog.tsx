"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { convertEntryToStepAction } from "@/app/actions/sales";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { appDayKey, shiftDayKey } from "@/lib/time-zone";
import { cn } from "@/lib/utils";
import { KIND_META } from "../../activity-kind";
import type { ActivityView } from "../../types";
import { Field, PersonSelect } from "./activity-fields";
import { useUnstickRefresh } from "./use-unstick-refresh";

type Person = { id: string; name: string; avatar_url: string | null };

/** Moves a logged entry (saved as "already happened" by mistake) into Next steps. */
export function MoveToStepsDialog({
  entry,
  people,
  currentUserId,
  open,
  onOpenChange,
}: {
  entry: ActivityView | null;
  people: Person[];
  currentUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {entry && (
          <MoveForm
            key={entry.id}
            entry={entry}
            people={people}
            currentUserId={currentUserId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({
  entry,
  people,
  currentUserId,
  onClose,
}: {
  entry: ActivityView;
  people: Person[];
  currentUserId: string;
  onClose: () => void;
}) {
  const ids = useId();
  const [isPending, startTransition] = useTransition();
  useUnstickRefresh(isPending);
  const [dueOn, setDueOn] = useState(() => shiftDayKey(appDayKey(Date.now()), 1));
  const [assignee, setAssignee] = useState(() => (people.some((p) => p.id === currentUserId) ? currentUserId : ""));
  const meta = KIND_META[entry.kind === "system" ? "note" : entry.kind];
  const Icon = meta.icon;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(dueOn) && assignee !== "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending || !valid) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof convertEntryToStepAction>>;
      try {
        result = await convertEntryToStepAction({ activity_id: entry.id, due_on: dueOn, assignee_id: assignee });
      } catch {
        toast.error("Could not move the entry. Try again.");
        return;
      }
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onClose();
      toast.success("Moved to Next steps");
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Move to Next steps</DialogTitle>
        <DialogDescription className="sr-only">Turns this entry into a planned step with a due date and a responsible person</DialogDescription>
      </DialogHeader>

      <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5">
        <span
          role="img"
          aria-label={meta.label}
          className={cn("mt-px flex size-6 shrink-0 items-center justify-center rounded-md", meta.circle)}
        >
          <Icon className="size-3.5" />
        </span>
        <p className="min-w-0 text-sm leading-relaxed break-words whitespace-pre-line">{entry.body}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${ids}-due`} label="Due date">
          <Input
            id={`${ids}-due`}
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            required
          />
        </Field>
        <Field id={`${ids}-who`} label="Responsible">
          <PersonSelect id={`${ids}-who`} value={assignee} onChange={setAssignee} people={people} size="default" />
        </Field>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !valid}>
          {isPending ? "Moving…" : "Move to Next steps"}
        </Button>
      </DialogFooter>
    </form>
  );
}
