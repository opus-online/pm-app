"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelStepAction } from "@/app/actions/sales";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { KIND_META } from "../../activity-kind";
import type { NextStepView } from "../../types";
import { useUnstickRefresh } from "./use-unstick-refresh";

/** Cancels a planned step with an optional reason. It leaves the Next steps card and shows as
 * cancelled in the timeline. */
export function CancelStepDialog({
  step,
  open,
  onOpenChange,
}: {
  step: NextStepView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step && <CancelStepForm key={step.activity_id} step={step} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CancelStepForm({ step, onClose }: { step: NextStepView; onClose: () => void }) {
  const ids = useId();
  const [isPending, startTransition] = useTransition();
  useUnstickRefresh(isPending);
  const [reason, setReason] = useState("");
  const { icon: Icon, circle, label } = KIND_META[step.kind];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof cancelStepAction>>;
      try {
        result = await cancelStepAction({ activity_id: step.activity_id, reason });
      } catch {
        toast.error("Could not cancel the step. Try again.");
        return;
      }
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onClose();
      toast.success("Step cancelled");
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Cancel this step?</DialogTitle>
        <DialogDescription className="sr-only">The step leaves Next steps and stays in the history as cancelled</DialogDescription>
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

      <div className="grid gap-1.5">
        <Label htmlFor={`${ids}-reason`}>Reason</Label>
        <Textarea
          id={`${ids}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          placeholder="Optional"
          maxLength={500}
          rows={2}
          autoFocus
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Keep step
        </Button>
        <Button type="submit" variant="destructive" disabled={isPending}>
          {isPending ? "Cancelling…" : "Cancel step"}
        </Button>
      </DialogFooter>
    </form>
  );
}
