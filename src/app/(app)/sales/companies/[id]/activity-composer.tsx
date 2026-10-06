"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { logActivityAction } from "@/app/actions/sales";
import { ACTIVITY_KINDS } from "@/lib/sales/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { ContactView, DealView } from "../../types";
import { KIND_META } from "./activity-kind";
import { useHydrated } from "./use-hydrated";

type LoggableKind = (typeof ACTIVITY_KINDS)[number];
const NONE = "none";

/** Local wall-clock "YYYY-MM-DDTHH:mm" -- the value format of <input type="datetime-local">. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActivityComposer({
  companyId,
  contacts,
  deals,
  activeDealId,
}: {
  companyId: string;
  contacts: ContactView[];
  deals: DealView[];
  activeDealId: string | null;
}) {
  const ids = useId();
  const hydrated = useHydrated();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<LoggableKind>("call");
  const [body, setBody] = useState("");
  const [contactId, setContactId] = useState(NONE);
  const [dealId, setDealId] = useState(activeDealId ?? NONE);
  // null = "now": the field shows the time the form was opened/reset, and an untouched field
  // lets the server stamp the real moment of logging.
  const [when, setWhen] = useState<string | null>(null);
  const [openedAt, setOpenedAt] = useState(() => toLocalInput(new Date()));
  const [followUp, setFollowUp] = useState("");

  // Opening another deal (?deal=) re-targets the composer at it.
  const [syncedDealId, setSyncedDealId] = useState(activeDealId);
  if (syncedDealId !== activeDealId) {
    setSyncedDealId(activeDealId);
    setDealId(activeDealId ?? NONE);
    setFollowUp("");
  }

  const hasDeal = dealId !== NONE;
  const canSubmit = body.trim().length > 0 && !isPending;

  function reset() {
    setBody("");
    setContactId(NONE);
    setDealId(activeDealId ?? NONE);
    setWhen(null);
    setOpenedAt(toLocalInput(new Date()));
    setFollowUp("");
  }

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof logActivityAction>>;
      try {
        result = await logActivityAction({
          client_id: companyId,
          deal_id: hasDeal ? dealId : null,
          contact_id: contactId !== NONE ? contactId : null,
          kind,
          body,
          occurred_at: when ? new Date(when).toISOString() : undefined,
          set_follow_up_on: hasDeal && followUp ? followUp : null,
        });
      } catch {
        toast.error("Could not log the activity. Try again.");
        return;
      }
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      // Partial success: the entry is saved (so reset), only the follow-up date failed.
      if (result.warning) toast.warning(result.warning);
      else toast.success(`${KIND_META[kind].label} logged`);
      reset();
    });
  }

  return (
    <Card size="sm">
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <ToggleGroup
            value={[kind]}
            onValueChange={(v: string[]) => v[0] && setKind(v[0] as LoggableKind)}
            size="sm"
            spacing={1}
            aria-label="Activity type"
          >
            {ACTIVITY_KINDS.map((k) => {
              const { icon: Icon, label, pressed } = KIND_META[k];
              return (
                <ToggleGroupItem key={k} value={k} className={cn("px-2.5 text-muted-foreground", pressed)}>
                  <Icon />
                  {label}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>

          <Textarea
            aria-label="What happened"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={KIND_META[kind].placeholder}
            rows={3}
            className="min-h-20 resize-y"
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-contact`} className="text-xs text-muted-foreground">
                Contact
              </Label>
              <Select value={contactId} onValueChange={(v) => setContactId(v ?? NONE)}>
                <SelectTrigger id={`${ids}-contact`} size="sm" className="w-full">
                  <SelectValue>
                    {(v: string) => contacts.find((c) => c.id === v)?.name ?? <span className="text-muted-foreground">None</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-deal`} className="text-xs text-muted-foreground">
                Deal
              </Label>
              <Select
                value={dealId}
                onValueChange={(v) => {
                  setDealId(v ?? NONE);
                  if (!v || v === NONE) setFollowUp("");
                }}
              >
                <SelectTrigger id={`${ids}-deal`} size="sm" className="w-full">
                  <SelectValue>
                    {(v: string) => deals.find((d) => d.id === v)?.title ?? <span className="text-muted-foreground">None</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {deals.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-when`} className="text-xs text-muted-foreground">
                When
              </Label>
              <Input
                id={`${ids}-when`}
                type="datetime-local"
                className="h-7 text-[0.8rem]"
                // Viewer's clock/time zone only after hydration (the server's would mismatch).
                value={hydrated ? (when ?? openedAt) : ""}
                onChange={(e) => setWhen(e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={`${ids}-follow-up`}
                className={cn("text-xs text-muted-foreground", !hasDeal && "opacity-50")}
              >
                Next follow-up
              </Label>
              <Input
                id={`${ids}-follow-up`}
                type="date"
                className="h-7 text-[0.8rem]"
                disabled={!hasDeal}
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!canSubmit} title="Log (Ctrl/⌘ + Enter)">
              {isPending ? "Logging…" : "Log"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
