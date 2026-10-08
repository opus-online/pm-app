"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { CalendarPlusIcon, CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { logActivityAction, planStepAction } from "@/app/actions/sales";
import { OPEN_STAGES } from "@/lib/sales/types";
import { formatDateEt } from "@/lib/sales/date-format";
import { singleId } from "@/lib/sales/preselect";
import { appDayKey, shiftDayKey } from "@/lib/time-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { KIND_META } from "../../activity-kind";
import type { ContactView, DealView } from "../../types";
import {
  Field, KindToggle, NONE, OptionalSelect, PersonSelect, PLAN_PLACEHOLDER, toLocalInput, type LoggableKind,
} from "./activity-fields";
import { usePlanStep } from "./plan-step-context";
import { useUnstickRefresh } from "./use-unstick-refresh";
import { useHydrated } from "./use-hydrated";

type Mode = "log" | "plan";
type Person = { id: string; name: string; avatar_url: string | null };

const tomorrow = () => shiftDayKey(appDayKey(Date.now()), 1);

/** Log something that happened, or plan the next step. The page's plan-step context switches it
 * to plan mode with a contact / deal prefilled and scrolls it into view. */
export function ActivityComposer({
  companyId,
  contacts,
  deals,
  people,
  currentUserId,
  activeDealId,
}: {
  companyId: string;
  contacts: ContactView[];
  deals: DealView[];
  /** Assignable Sales people. */
  people: Person[];
  currentUserId: string;
  activeDealId: string | null;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  useUnstickRefresh(isPending);
  const defaultAssignee = people.some((p) => p.id === currentUserId) ? currentUserId : (people[0]?.id ?? "");
  // A company with exactly one contact / one open deal gets it preselected (both modes).
  const openDeals = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const soleContact = singleId(contacts) ?? NONE;
  const soleDeal = singleId(openDeals) ?? NONE;

  const [mode, setMode] = useState<Mode>("log");
  const [kind, setKind] = useState<LoggableKind>("call");
  const [body, setBody] = useState("");
  const [contactId, setContactId] = useState(soleContact);
  const [dealId, setDealId] = useState(activeDealId ?? soleDeal);
  // null = "now": the field shows the time the form was opened/reset, and an untouched field
  // lets the server stamp the real moment of logging.
  const [when, setWhen] = useState<string | null>(null);
  const [openedAt, setOpenedAt] = useState(() => toLocalInput(new Date()));
  const [dueOn, setDueOn] = useState(tomorrow);
  const [assigneeId, setAssigneeId] = useState(defaultAssignee);
  // A prefilled deal survives the deal sheet closing (which clears ?deal=) until the next reset.
  const [keepDeal, setKeepDeal] = useState(false);

  // Opening another deal (?deal=) re-targets the composer at it.
  const [syncedDealId, setSyncedDealId] = useState(activeDealId);
  if (syncedDealId !== activeDealId) {
    setSyncedDealId(activeDealId);
    if (activeDealId !== null || !keepDeal) setDealId(activeDealId ?? soleDeal);
  }

  // "Plan next step" from the Next steps card, the Mark done toast or the deal sheet.
  const { request } = usePlanStep();
  const [appliedNonce, setAppliedNonce] = useState(request?.nonce ?? 0);
  if (request && request.nonce !== appliedNonce) {
    setAppliedNonce(request.nonce);
    setMode("plan");
    // The prefill wins; an empty one still gets the sole contact / deal.
    setContactId(request.contact_id && contacts.some((c) => c.id === request.contact_id) ? request.contact_id : soleContact);
    setDealId(request.deal_id && deals.some((d) => d.id === request.deal_id) ? request.deal_id : soleDeal);
    setKeepDeal(request.deal_id !== null);
    if (!body.trim()) setDueOn(tomorrow());
  }
  useEffect(() => {
    if (!appliedNonce) return;
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // After the deal sheet / dialog that asked has handed focus back.
    const t = setTimeout(() => bodyRef.current?.focus({ preventScroll: true }), 300);
    return () => clearTimeout(t);
  }, [appliedNonce]);

  const planning = mode === "plan";
  // A step on a won/lost deal would never show as a next step: plan mode offers open deals only,
  // and a closed deal carried over from log mode / ?deal= falls back to None.
  const dealOptions = planning ? openDeals : deals;
  const selectedDealId = dealOptions.some((d) => d.id === dealId) ? dealId : NONE;
  const validDue = /^\d{4}-\d{2}-\d{2}$/.test(dueOn);
  const canSubmit = body.trim().length > 0 && !isPending && (!planning || (validDue && assigneeId !== ""));

  function switchMode(next: Mode) {
    setMode(next);
    if (contactId === NONE) setContactId(soleContact);
    if (!(next === "plan" ? openDeals : deals).some((d) => d.id === dealId)) setDealId(soleDeal);
  }

  function reset() {
    setBody("");
    setContactId(soleContact);
    setDealId(activeDealId ?? soleDeal);
    setKeepDeal(false);
    setWhen(null);
    setOpenedAt(toLocalInput(new Date()));
    setDueOn(tomorrow());
    setAssigneeId(defaultAssignee);
  }

  function submit() {
    if (!canSubmit) return;
    const refs = {
      client_id: companyId,
      deal_id: selectedDealId !== NONE ? selectedDealId : null,
      contact_id: contactId !== NONE ? contactId : null,
      kind,
      body,
    };
    startTransition(async () => {
      let result: { error: string } | { success: true };
      try {
        result = planning
          ? await planStepAction({ ...refs, due_on: dueOn, assignee_id: assigneeId })
          : await logActivityAction({ ...refs, occurred_at: when ? new Date(when).toISOString() : undefined });
      } catch {
        toast.error(planning ? "Could not plan the step. Try again." : "Could not log the activity. Try again.");
        return;
      }
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (planning) {
        const who = people.find((p) => p.id === assigneeId);
        toast.success(
          `Next step planned for ${formatDateEt(dueOn)}${who && who.id !== currentUserId ? ` · ${who.name}` : ""}`
        );
      } else {
        toast.success(`${KIND_META[kind].label} logged`);
      }
      reset();
    });
  }

  return (
    <Card size="sm" ref={rootRef} className="scroll-mt-6">
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup
              value={[mode]}
              onValueChange={(v: string[]) => v[0] && switchMode(v[0] as Mode)}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Log or plan"
            >
              <ToggleGroupItem value="log" className="px-2.5 aria-pressed:bg-muted aria-pressed:text-foreground">
                <CheckIcon />
                Log done
              </ToggleGroupItem>
              <ToggleGroupItem
                value="plan"
                className="px-2.5 aria-pressed:bg-blue-500/10 aria-pressed:text-blue-700 dark:aria-pressed:text-blue-300"
              >
                <CalendarPlusIcon />
                Plan next step
              </ToggleGroupItem>
            </ToggleGroup>

            <KindToggle value={kind} onChange={setKind} />
          </div>

          <Textarea
            ref={bodyRef}
            aria-label={planning ? "What to do" : "What happened"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={planning ? PLAN_PLACEHOLDER[kind] : KIND_META[kind].placeholder}
            maxLength={planning ? 2000 : 5000}
            rows={planning ? 2 : 3}
            className={cn("resize-y", planning ? "min-h-16" : "min-h-20")}
          />

          <div className={cn("grid gap-3 sm:grid-cols-2", planning ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
            {planning && (
              <>
                <Field id={`${ids}-due`} label="Due date">
                  <Input
                    id={`${ids}-due`}
                    type="date"
                    required
                    className="h-7 text-[0.8rem]"
                    value={dueOn}
                    onChange={(e) => setDueOn(e.target.value)}
                    aria-invalid={!validDue || undefined}
                  />
                </Field>
                <Field id={`${ids}-assignee`} label="Assignee">
                  <PersonSelect id={`${ids}-assignee`} value={assigneeId} onChange={setAssigneeId} people={people} />
                </Field>
              </>
            )}
            <Field id={`${ids}-contact`} label="Contact">
              <OptionalSelect
                id={`${ids}-contact`}
                value={contactId}
                onChange={setContactId}
                options={contacts.map((c) => ({ id: c.id, label: c.name }))}
              />
            </Field>
            <Field id={`${ids}-deal`} label="Deal">
              <OptionalSelect
                id={`${ids}-deal`}
                value={selectedDealId}
                onChange={(v) => {
                  setDealId(v);
                  setKeepDeal(false);
                }}
                options={dealOptions.map((d) => ({ id: d.id, label: d.title }))}
              />
            </Field>
            {!planning && (
              <Field id={`${ids}-when`} label="When">
                <Input
                  id={`${ids}-when`}
                  type="datetime-local"
                  className="h-7 text-[0.8rem]"
                  // Viewer's clock/time zone only after hydration (the server's would mismatch).
                  value={hydrated ? (when ?? openedAt) : ""}
                  onChange={(e) => setWhen(e.target.value || null)}
                />
              </Field>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit}
              title={`${planning ? "Plan" : "Log"} (Ctrl/⌘ + Enter)`}
            >
              {isPending ? (planning ? "Planning…" : "Logging…") : planning ? "Plan" : "Log"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
