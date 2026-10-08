"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { editEntryAction } from "@/app/actions/sales";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { KIND_META } from "../../activity-kind";
import type { ActivityView, ContactView, DealView } from "../../types";
import { Field, KindToggle, NONE, OptionalSelect, toLocalInput, type LoggableKind } from "./activity-fields";
import { useUnstickRefresh } from "./use-unstick-refresh";

/** Edits a logged (done, non-system) entry: type, text, contact, deal and -- for plain log
 * entries -- when it happened. A completed step's day is its done day, so it has no "When". */
export function EntryEditDialog({
  entry,
  contacts,
  deals,
  open,
  onOpenChange,
}: {
  entry: ActivityView | null;
  contacts: ContactView[];
  deals: DealView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {entry && entry.kind !== "system" && (
          <EntryEditForm
            key={entry.id}
            entry={entry as ActivityView & { kind: LoggableKind }}
            contacts={contacts}
            deals={deals}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EntryEditForm({
  entry,
  contacts,
  deals,
  onClose,
}: {
  entry: ActivityView & { kind: LoggableKind };
  contacts: ContactView[];
  deals: DealView[];
  onClose: () => void;
}) {
  const ids = useId();
  const [isPending, startTransition] = useTransition();
  useUnstickRefresh(isPending);
  const doneStep = entry.done_at !== null;
  // The dialog only renders after a click, so the viewer's clock / time zone is safe here.
  const [initialWhen] = useState(() => toLocalInput(new Date(entry.occurred_at)));
  const [kind, setKind] = useState<LoggableKind>(entry.kind);
  const [body, setBody] = useState(entry.body);
  const [when, setWhen] = useState(initialWhen);
  const initialContact = entry.contact_id && contacts.some((c) => c.id === entry.contact_id) ? entry.contact_id : NONE;
  const initialDeal = entry.deal_id && deals.some((d) => d.id === entry.deal_id) ? entry.deal_id : NONE;
  const [contactId, setContactId] = useState(initialContact);
  const [dealId, setDealId] = useState(initialDeal);

  const validWhen = doneStep || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when);
  const whenChanged = !doneStep && when !== initialWhen;
  const dirty =
    kind !== entry.kind ||
    body.trim() !== entry.body ||
    whenChanged ||
    contactId !== initialContact ||
    dealId !== initialDeal;
  const canSubmit = dirty && body.trim().length > 0 && validWhen && !isPending;

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof editEntryAction>>;
      try {
        result = await editEntryAction({
          activity_id: entry.id,
          kind,
          body,
          // Untouched keeps the exact original moment (minutes-only input would drop seconds).
          occurred_at: whenChanged ? new Date(when).toISOString() : null,
          contact_id: contactId !== NONE ? contactId : null,
          deal_id: dealId !== NONE ? dealId : null,
        });
      } catch {
        toast.error("Could not save the entry. Try again.");
        return;
      }
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onClose();
      toast.success("Entry updated");
    });
  }

  const { icon: Icon, circle } = KIND_META[kind];

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span aria-hidden className={cn("flex size-6 items-center justify-center rounded-md", circle)}>
            <Icon className="size-3.5" />
          </span>
          Edit entry
        </DialogTitle>
        <DialogDescription className="sr-only">Change the entry&apos;s type, text and links</DialogDescription>
      </DialogHeader>

      <KindToggle value={kind} onChange={setKind} />

      <Textarea
        aria-label="What happened"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        placeholder={KIND_META[kind].placeholder}
        maxLength={5000}
        rows={4}
        autoFocus
        className="min-h-24 resize-y"
      />

      <div className={cn("grid gap-3 sm:grid-cols-2", !doneStep && "sm:grid-cols-3")}>
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
            value={dealId}
            onChange={setDealId}
            options={deals.map((d) => ({ id: d.id, label: d.title }))}
          />
        </Field>
        {!doneStep && (
          <Field id={`${ids}-when`} label="When">
            <Input
              id={`${ids}-when`}
              type="datetime-local"
              required
              className="text-[0.8rem]"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-invalid={!validWhen || undefined}
            />
          </Field>
        )}
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
