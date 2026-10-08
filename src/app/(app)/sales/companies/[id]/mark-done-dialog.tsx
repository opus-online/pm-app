"use client";

import { useId, useState, useTransition } from "react";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { completeStepAction } from "@/app/actions/sales";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appDayKey } from "@/lib/time-zone";
import { cn } from "@/lib/utils";
import { KIND_META } from "../../activity-kind";
import type { NextStepView } from "../../types";
import type { PlanPrefill } from "./plan-step-context";
import { useUnstickRefresh } from "./use-unstick-refresh";

type Person = { id: string; name: string; avatar_url: string | null };

/** Completes a planned step: when, by whom, and an optional comment. On success it offers to
 * plan the follow-up step for the same contact / deal. */
export function MarkDoneDialog({
  step,
  people,
  currentUserId,
  open,
  onOpenChange,
  onDone,
}: {
  step: NextStepView | null;
  people: Person[];
  currentUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (prefill: PlanPrefill) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed per step, so every open starts from fresh defaults. */}
        {step && (
          <MarkDoneForm
            key={step.activity_id}
            step={step}
            people={people}
            currentUserId={currentUserId}
            onClose={() => onOpenChange(false)}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MarkDoneForm({
  step,
  people,
  currentUserId,
  onClose,
  onDone,
}: {
  step: NextStepView;
  people: Person[];
  currentUserId: string;
  onClose: () => void;
  onDone: (prefill: PlanPrefill) => void;
}) {
  const ids = useId();
  const [isPending, startTransition] = useTransition();
  useUnstickRefresh(isPending);
  const [today] = useState(() => appDayKey(Date.now()));
  const [doneOn, setDoneOn] = useState(today);
  const fallbackBy = people.some((p) => p.id === currentUserId) ? currentUserId : (step.assignee?.id ?? "");
  const [doneBy, setDoneBy] = useState(fallbackBy);
  const [comment, setComment] = useState("");
  const { icon: Icon, circle, label } = KIND_META[step.kind];

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(doneOn) && doneOn <= today;
  const canSubmit = validDate && doneBy !== "" && !isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const prefill = { contact_id: step.contact_id, deal_id: step.deal_id };
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof completeStepAction>>;
      try {
        result = await completeStepAction({
          activity_id: step.activity_id,
          done_on: doneOn,
          done_by: doneBy,
          comment,
        });
      } catch {
        toast.error("Could not mark the step done. Try again.");
        return;
      }
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onClose();
      toast.success("Step done", {
        duration: 10_000,
        action: { label: "Plan next step", onClick: () => onDone(prefill) },
      });
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Mark step done</DialogTitle>
        <DialogDescription className="sr-only">Record when and by whom the step was done</DialogDescription>
      </DialogHeader>

      <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5">
        <span
          role="img"
          aria-label={label}
          className={cn("mt-px flex size-6 shrink-0 items-center justify-center rounded-md", circle)}
        >
          <Icon className="size-3.5" />
        </span>
        <p className="min-w-0 text-sm leading-relaxed break-words whitespace-pre-line">{step.body}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-on`}>Done on</Label>
          <Input
            id={`${ids}-on`}
            type="date"
            required
            max={today}
            value={doneOn}
            onChange={(e) => setDoneOn(e.target.value)}
            aria-invalid={!validDate || undefined}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${ids}-by`}>Done by</Label>
          <Select value={doneBy} onValueChange={(v) => v && setDoneBy(v)}>
            <SelectTrigger id={`${ids}-by`} className="w-full">
              <SelectValue>
                {(v: string) => {
                  const p = people.find((x) => x.id === v);
                  return p ? <PersonOption person={p} /> : <span className="text-muted-foreground">Select</span>;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <PersonOption person={p} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-comment`}>Comment</Label>
        <Textarea
          id={`${ids}-comment`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          placeholder="How did it go?"
          maxLength={2000}
          rows={3}
          autoFocus
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          <CheckIcon />
          {isPending ? "Saving…" : "Mark done"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PersonOption({ person }: { person: Person }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PersonAvatar name={person.name} avatarUrl={person.avatar_url} className="size-5 text-[8px]" />
      <span className="truncate">{person.name}</span>
    </span>
  );
}
