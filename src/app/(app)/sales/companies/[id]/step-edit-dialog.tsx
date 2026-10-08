"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateStepAction } from "@/app/actions/sales";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateEt } from "@/lib/sales/date-format";
import { OPEN_STAGES } from "@/lib/sales/types";
import type { ContactView, DealView, NextStepView } from "../../types";
import { Field, KindToggle, NONE, OptionalSelect, PersonSelect, PLAN_PLACEHOLDER, type LoggableKind } from "./activity-fields";
import { useUnstickRefresh } from "./use-unstick-refresh";

type Person = { id: string; name: string; avatar_url: string | null };

/** Edits every field of a planned step. Date / responsible changes still log their system
 * entries (done by the RPC). */
export function StepEditDialog({
  step,
  people,
  contacts,
  deals,
  open,
  onOpenChange,
}: {
  step: NextStepView | null;
  /** Assignable Sales people. */
  people: Person[];
  contacts: ContactView[];
  deals: DealView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Keyed per step, so every open starts from the step's saved values. */}
        {step && (
          <StepEditForm
            key={step.activity_id}
            step={step}
            people={people}
            contacts={contacts}
            deals={deals}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepEditForm({
  step,
  people,
  contacts,
  deals,
  onClose,
}: {
  step: NextStepView;
  people: Person[];
  contacts: ContactView[];
  deals: DealView[];
  onClose: () => void;
}) {
  const ids = useId();
  const [isPending, startTransition] = useTransition();
  useUnstickRefresh(isPending);
  const [kind, setKind] = useState<LoggableKind>(step.kind);
  const [body, setBody] = useState(step.body);
  const [dueOn, setDueOn] = useState(step.due_on);
  const [assigneeId, setAssigneeId] = useState(
    step.assignee && people.some((p) => p.id === step.assignee?.id) ? step.assignee.id : ""
  );
  const [contactId, setContactId] = useState(step.contact_id ?? NONE);
  const [dealId, setDealId] = useState(step.deal_id ?? NONE);

  // A step only shows while its deal is open, so open deals are the only choices.
  const dealOptions = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const selectedDealId = dealOptions.some((d) => d.id === dealId) ? dealId : NONE;
  const validDue = /^\d{4}-\d{2}-\d{2}$/.test(dueOn);
  const dirty =
    kind !== step.kind ||
    body.trim() !== step.body ||
    dueOn !== step.due_on ||
    assigneeId !== (step.assignee?.id ?? "") ||
    contactId !== (step.contact_id ?? NONE) ||
    selectedDealId !== (step.deal_id ?? NONE);
  const canSubmit = dirty && body.trim().length > 0 && validDue && assigneeId !== "" && !isPending;

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    const moved = dueOn !== step.due_on;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof updateStepAction>>;
      try {
        result = await updateStepAction({
          activity_id: step.activity_id,
          kind,
          body,
          due_on: dueOn,
          assignee_id: assigneeId,
          contact_id: contactId !== NONE ? contactId : null,
          deal_id: selectedDealId !== NONE ? selectedDealId : null,
        });
      } catch {
        toast.error("Could not save the step. Try again.");
        return;
      }
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onClose();
      toast.success(moved ? `Step updated · due ${formatDateEt(dueOn)}` : "Step updated");
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Edit next step</DialogTitle>
        <DialogDescription className="sr-only">Change what to do, when and who is responsible</DialogDescription>
      </DialogHeader>

      <KindToggle value={kind} onChange={setKind} />

      <Textarea
        aria-label="What to do"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        placeholder={PLAN_PLACEHOLDER[kind]}
        maxLength={2000}
        rows={3}
        autoFocus
        className="min-h-20 resize-y"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${ids}-due`} label="Due date">
          <Input
            id={`${ids}-due`}
            type="date"
            required
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            aria-invalid={!validDue || undefined}
          />
        </Field>
        <Field id={`${ids}-assignee`} label="Responsible">
          <PersonSelect id={`${ids}-assignee`} size="default" value={assigneeId} onChange={setAssigneeId} people={people} />
        </Field>
        <Field id={`${ids}-contact`} label="Contact">
          <OptionalSelect
            id={`${ids}-contact`}
            size="default"
            value={contactId}
            onChange={setContactId}
            options={contacts.map((c) => ({ id: c.id, label: c.name }))}
          />
        </Field>
        <Field id={`${ids}-deal`} label="Deal">
          <OptionalSelect
            id={`${ids}-deal`}
            size="default"
            value={selectedDealId}
            onChange={setDealId}
            options={dealOptions.map((d) => ({ id: d.id, label: d.title }))}
          />
        </Field>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit} title="Save (Ctrl/⌘ + Enter)">
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
