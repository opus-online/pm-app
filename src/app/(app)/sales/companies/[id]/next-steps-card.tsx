"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CalendarClockIcon, CheckIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, UserRoundIcon, UserRoundPenIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { reassignStepAction, rescheduleStepAction, updateStepAction } from "@/app/actions/sales";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { KIND_META } from "../../activity-kind";
import { DueChip } from "../../due-chip";
import { TruncateTooltip } from "../../truncate-tooltip";
import type { ContactView, DealView, NextStepView } from "../../types";
import { CancelStepDialog } from "./cancel-step-dialog";
import { DateCommitInput } from "./date-commit-input";
import { MarkDoneDialog, PersonOption } from "./mark-done-dialog";
import { usePlanStep, type PlanPrefill } from "./plan-step-context";
import { StepEditDialog } from "./step-edit-dialog";
import { useUnstickRefresh } from "./use-unstick-refresh";

type Person = { id: string; name: string; avatar_url: string | null };

const ACTION =
  "h-6 gap-1 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground";

/** The company's open planned steps, earliest first, with Mark done / Change date / Reassign /
 * Edit / Cancel. */
export function NextStepsCard({
  steps,
  people,
  contacts,
  deals,
  canManage,
  currentUserId,
  onPlanNext,
}: {
  steps: NextStepView[];
  /** Assignable Sales people (pickers list only these). */
  people: Person[];
  /** The company's contacts and deals, offered when editing a step. */
  contacts: ContactView[];
  deals: DealView[];
  canManage: boolean;
  currentUserId: string;
  /** Defaults to the page's plan-step context (opens the composer in plan mode). */
  onPlanNext?: (prefill: PlanPrefill) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { planNext: contextPlanNext } = usePlanStep();
  const planNext = onPlanNext ?? contextPlanNext;
  const [doneStep, setDoneStep] = useState<NextStepView | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [editStep, setEditStep] = useState<NextStepView | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelStep, setCancelStep] = useState<NextStepView | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Next steps
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{steps.length}</span>
        </CardTitle>
        {canManage && steps.length > 0 && (
          <CardAction>
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => planNext({ contact_id: null, deal_id: null })}
            >
              <PlusIcon />
              Plan step
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {steps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-3 py-5 text-center">
            <p className="text-sm text-muted-foreground">No next steps.</p>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => planNext({ contact_id: null, deal_id: null })}>
                <PlusIcon />
                Plan next step
              </Button>
            )}
          </div>
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {steps.map((s) => (
              <StepRow
                key={s.activity_id}
                step={s}
                people={people}
                canManage={canManage}
                onMarkDone={() => {
                  setDoneStep(s);
                  setDoneOpen(true);
                }}
                onEdit={() => {
                  setEditStep(s);
                  setEditOpen(true);
                }}
                onCancel={() => {
                  setCancelStep(s);
                  setCancelOpen(true);
                }}
                onOpenDeal={
                  s.deal_id ? () => router.replace(`${pathname}?deal=${s.deal_id}`, { scroll: false }) : undefined
                }
              />
            ))}
          </ul>
        )}
      </CardContent>

      {canManage && (
        <>
          <MarkDoneDialog
            step={doneStep}
            people={people}
            currentUserId={currentUserId}
            open={doneOpen}
            onOpenChange={setDoneOpen}
            onDone={planNext}
          />
          <StepEditDialog
            step={editStep}
            people={people}
            contacts={contacts}
            deals={deals}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <CancelStepDialog step={cancelStep} open={cancelOpen} onOpenChange={setCancelOpen} />
        </>
      )}
    </Card>
  );
}

function StepRow({
  step,
  people,
  canManage,
  onMarkDone,
  onEdit,
  onCancel,
  onOpenDeal,
}: {
  step: NextStepView;
  people: Person[];
  canManage: boolean;
  onMarkDone: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onOpenDeal?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  useUnstickRefresh(isPending);
  const [editingDate, setEditingDate] = useState(false);
  // Shown until the revalidated render brings the saved value (or dropped on failure).
  const [patch, setPatch] = useState<{ due_on?: string; assignee?: Person; body?: string } | null>(null);
  const [synced, setSynced] = useState(step);
  if (synced !== step) {
    setSynced(step);
    setPatch(null);
  }
  const dueOn = patch?.due_on ?? step.due_on;
  const assignee = patch?.assignee ?? step.assignee;
  const body = patch?.body ?? step.body;
  const [editingText, setEditingText] = useState(false);
  const [draft, setDraft] = useState("");
  // Enter / Escape close the editor; the blur that may follow must not save a second time.
  const textClosed = useRef(false);
  const { icon: Icon, circle, label } = KIND_META[step.kind];

  function run(optimistic: { due_on?: string; assignee?: Person; body?: string }, call: () => Promise<{ error: string } | { success: true }>) {
    setPatch((p) => ({ ...p, ...optimistic }));
    startTransition(async () => {
      try {
        const result = await call();
        if ("error" in result) toast.error(result.error);
      } catch {
        toast.error("Save failed. Try again.");
      }
      startTransition(() => setPatch(null));
    });
  }

  function reschedule(due_on: string) {
    run({ due_on }, () => rescheduleStepAction({ activity_id: step.activity_id, due_on }));
  }

  function reassign(id: string) {
    const person = people.find((p) => p.id === id);
    if (!person || person.id === assignee?.id) return;
    run({ assignee: person }, () => reassignStepAction({ activity_id: step.activity_id, assignee_id: person.id }));
  }

  function startTextEdit() {
    // update_step needs an assignee; a step without one goes through the full edit dialog.
    if (!step.assignee) {
      onEdit();
      return;
    }
    textClosed.current = false;
    setDraft(body);
    setEditingText(true);
  }

  function closeText(save: boolean) {
    if (textClosed.current) return;
    textClosed.current = true;
    setEditingText(false);
    const next = draft.trim();
    if (!save || !next || next === step.body || !step.assignee) return;
    const assigneeId = step.assignee.id;
    // Text only: kind, date, assignee, contact and deal go back unchanged (so no moved/reassigned
    // entry is logged).
    run({ body: next }, () =>
      updateStepAction({
        activity_id: step.activity_id,
        kind: step.kind,
        body: next,
        due_on: step.due_on,
        assignee_id: assigneeId,
        contact_id: step.contact_id,
        deal_id: step.deal_id,
      })
    );
  }

  return (
    <li
      className={cn(
        "group/step rounded-lg px-2 py-2 transition-colors hover:bg-muted/50 focus-within:bg-muted/50",
        isPending && "opacity-70"
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          role="img"
          aria-label={label}
          className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", circle)}
        >
          <Icon className="size-3.5" />
        </span>
        {canManage && editingText ? (
          <Input
            aria-label="Step text"
            autoFocus
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => closeText(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                closeText(true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeText(false);
              }
            }}
            className="h-7 min-w-0 flex-1 bg-background text-sm font-medium"
          />
        ) : canManage ? (
          <button
            type="button"
            aria-label={`Edit step: ${body}`}
            disabled={isPending}
            onClick={startTextEdit}
            className="-mx-1 min-w-0 flex-1 cursor-text rounded-md px-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default"
          >
            <TruncateTooltip text={body} className="text-sm font-medium" />
          </button>
        ) : (
          <TruncateTooltip text={body} className="flex-1 text-sm font-medium" />
        )}
        {editingDate ? (
          <DateCommitInput
            value={dueOn}
            aria-label="Due date"
            autoFocus
            className="h-6 w-36 shrink-0"
            onCommit={reschedule}
            onDone={() => setEditingDate(false)}
            onCancel={() => setEditingDate(false)}
          />
        ) : (
          <DueChip date={dueOn} className="shrink-0" />
        )}
      </div>

      <div className="mt-1 flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 pl-8.5 text-xs text-muted-foreground">
        {assignee && (
          <span className="flex min-w-0 items-center gap-1.5">
            <PersonAvatar name={assignee.name} avatarUrl={assignee.avatar_url} className="size-4 text-[7px]" />
            <span className="truncate">{assignee.name}</span>
          </span>
        )}
        {step.contact_name && (
          <span className="flex min-w-0 items-center gap-1">
            <UserRoundIcon aria-hidden className="size-3 shrink-0" />
            <span className="max-w-40 truncate">{step.contact_name}</span>
          </span>
        )}
        {step.deal_title &&
          (onOpenDeal ? (
            <button
              type="button"
              onClick={onOpenDeal}
              className="max-w-48 truncate rounded-md bg-muted px-1.5 py-px text-[11px] font-medium text-foreground/70 transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              {step.deal_title}
            </button>
          ) : (
            <span className="max-w-48 truncate rounded-md bg-muted px-1.5 py-px text-[11px] font-medium text-foreground/70">
              {step.deal_title}
            </span>
          ))}

        {canManage && (
          // On hover / keyboard focus for mouse users; always there on touch screens.
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/step:opacity-100 group-focus-within/step:opacity-100 has-aria-expanded:opacity-100 pointer-coarse:opacity-100">
            <Button size="xs" variant="ghost" className={ACTION} onClick={onMarkDone}>
              <CheckIcon />
              Mark done
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className={ACTION}
              aria-pressed={editingDate}
              onClick={() => setEditingDate((v) => !v)}
            >
              <CalendarClockIcon />
              Change date
            </Button>
            <SelectPrimitive.Root value={assignee?.id ?? null} onValueChange={(v) => v && reassign(v as string)}>
              <SelectPrimitive.Trigger aria-label="Reassign" render={<Button size="xs" variant="ghost" className={ACTION} />}>
                <UserRoundPenIcon />
                Reassign
              </SelectPrimitive.Trigger>
              <SelectContent align="end" alignItemWithTrigger={false} className="min-w-48">
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <PersonOption person={p} />
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectPrimitive.Root>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More step actions"
                render={<Button size="icon-xs" variant="ghost" className={ACTION} />}
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-36">
                <DropdownMenuItem onClick={onEdit}>
                  <PencilIcon />
                  Edit step
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onCancel}>
                  <XIcon />
                  Cancel step
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </li>
  );
}
