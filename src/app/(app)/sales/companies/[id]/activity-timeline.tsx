"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MoreHorizontal, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteActivityAction } from "@/app/actions/sales";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { appClockTime, appDayKey, shiftDayKey } from "@/lib/time-zone";
import { cn } from "@/lib/utils";
import { formatDateEt } from "@/lib/sales/date-format";
import { timelineAt, visibleInTimeline, type TimelineMode } from "@/lib/sales/timeline-filter";
import type { ActivityView, ContactView, DealView } from "../../types";
import { KIND_META } from "../../activity-kind";
import { EntryEditDialog } from "./entry-edit-dialog";
import { useTimelineMode } from "./use-timeline-mode";

function dayLabel(key: string, todayKey: string, yesterdayKey: string) {
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return formatDateEt(key);
}

export function ActivityTimeline({
  activities,
  contacts,
  deals,
  canManage,
  showDeal = true,
  emptyText,
}: {
  activities: ActivityView[];
  /** The company's contacts and deals, offered when editing an entry. */
  contacts: ContactView[];
  deals: DealView[];
  canManage: boolean;
  /** Off inside a deal's own panel, where the deal chip would only repeat the context. */
  showDeal?: boolean;
  emptyText?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mode, setMode] = useTimelineMode();
  const [deleting, setDeleting] = useState<ActivityView | null>(null);
  const [editing, setEditing] = useState<ActivityView | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Captured once per mount: "Today" is relative to when the page was opened.
  const [now] = useState(() => Date.now());
  // Days split at Estonian midnight on server and client alike (no post-hydration jump).
  const todayKey = appDayKey(now);
  const yesterdayKey = shiftDayKey(todayKey, -1);

  const visible = activities.filter((a) => visibleInTimeline(a, mode));
  const groups: { key: string; items: ActivityView[] }[] = [];
  for (const a of visible) {
    // A completed / cancelled step belongs to the day it was closed.
    const key = appDayKey(timelineAt(a));
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(a);
    else groups.push({ key, items: [a] });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Activity
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{visible.length}</span>
        </CardTitle>
        {activities.length > 0 && (
          <CardAction>
            <ToggleGroup
              value={[mode]}
              onValueChange={(v: string[]) => v[0] && setMode(v[0] as TimelineMode)}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Show"
              className="-my-1"
            >
              <ToggleGroupItem value="entries" className="h-6 px-2 text-xs aria-pressed:bg-muted aria-pressed:text-foreground">
                Entries
              </ToggleGroupItem>
              <ToggleGroupItem value="all" className="h-6 px-2 text-xs aria-pressed:bg-muted aria-pressed:text-foreground">
                All
              </ToggleGroupItem>
            </ToggleGroup>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {activities.length > 0
              ? "No entries yet."
              : (emptyText ?? (canManage ? "No activity yet — log the first call or email above." : "No activity yet."))}
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.key}>
                <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {dayLabel(g.key, todayKey, yesterdayKey)}
                </h3>
                <ol className="relative">
                  {g.items.map((a, i) => {
                    // Logged entries (not automatic ones, not cancelled steps) are editable by any
                    // Sales user, and any Sales user can delete them (each delete is audited).
                    const editable = canManage && a.kind !== "system" && a.status === "done";
                    return (
                      <TimelineItem
                        key={a.id}
                        activity={a}
                        last={i === g.items.length - 1}
                        onEdit={
                          editable
                            ? () => {
                                setEditing(a);
                                setEditOpen(true);
                              }
                            : undefined
                        }
                        onDelete={editable ? () => setDeleting(a) : undefined}
                        onOpenDeal={
                          showDeal && a.deal_id
                            ? () => router.replace(`${pathname}?deal=${a.deal_id}`, { scroll: false })
                            : undefined
                        }
                      />
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </CardContent>

      {canManage && (
        <>
          <EntryEditDialog entry={editing} contacts={contacts} deals={deals} open={editOpen} onOpenChange={setEditOpen} />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(o) => !o && setDeleting(null)}
            title="Delete this entry?"
            description="It will be removed from the timeline for everyone."
            onConfirm={async () => {
              if (!deleting) return;
              try {
                const result = await deleteActivityAction(deleting.id);
                if ("success" in result) toast.success("Entry deleted");
                return result;
              } catch {
                return { error: "Delete failed. Try again." };
              }
            }}
          />
        </>
      )}
    </Card>
  );
}

function TimelineItem({
  activity: a,
  last,
  onEdit,
  onDelete,
  onOpenDeal,
}: {
  activity: ActivityView;
  last: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpenDeal?: () => void;
}) {
  const system = a.kind === "system";
  const doneStep = a.done_at !== null;
  const cancelled = a.status === "cancelled";
  const closedStep = doneStep || cancelled;
  const { icon: Icon, circle } = KIND_META[a.kind];

  // A closed step's own line says who closed it and when; its creation time adds nothing.
  const meta = [
    ...(closedStep
      ? [a.contact_name]
      : [
          a.actor?.name ?? null,
          <span key="t" className="tabular-nums">{appClockTime(a.occurred_at)}</span>,
          a.contact_name,
        ]),
    a.edited_at ? (
      <span key="e" className="tabular-nums">
        edited by {a.edited_by?.name ?? "Unknown"} · {formatDateEt(a.edited_at)}
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <li className="group relative flex gap-3 pb-4 last:pb-0">
      {/* Rail between icons, within the day. */}
      {!last && <span aria-hidden className="absolute top-8 bottom-0 left-3.5 w-px -translate-x-1/2 bg-border" />}
      <span className="flex w-7 shrink-0 justify-center">
        <span
          aria-hidden
          className={cn(
            "relative flex items-center justify-center rounded-full",
            system ? "mt-0.5 size-5" : "size-7",
            cancelled ? "bg-muted text-muted-foreground/70" : circle
          )}
        >
          <Icon className={system ? "size-3" : "size-3.5"} />
          {doneStep && (
            <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] leading-none font-bold text-white ring-2 ring-card">
              ✓
            </span>
          )}
          {cancelled && (
            <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-muted-foreground/70 text-[8px] leading-none font-bold text-card ring-2 ring-card">
              ✕
            </span>
          )}
        </span>
      </span>
      <div className={cn("min-w-0 flex-1", system ? "pt-0.5" : "pt-1")}>
        <p
          className={cn(
            "break-words whitespace-pre-line",
            system ? "text-xs text-muted-foreground" : "text-sm leading-relaxed",
            cancelled && "text-muted-foreground line-through decoration-muted-foreground/40"
          )}
        >
          {a.body}
        </p>
        {doneStep && (
          <div className="mt-1.5 border-l-2 border-emerald-500/40 pl-2.5">
            <p className="text-xs font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
              ✓ Done by {a.done_by?.name ?? "Unknown"} · {formatDateEt(a.done_at)}
            </p>
            {a.done_comment && (
              <p className="mt-0.5 text-sm break-words whitespace-pre-line text-muted-foreground">{a.done_comment}</p>
            )}
          </div>
        )}
        {cancelled && (
          <div className="mt-1.5 border-l-2 border-border pl-2.5">
            <p className="text-xs font-medium text-muted-foreground tabular-nums">
              ✕ Cancelled by {a.cancelled_by?.name ?? "Unknown"} · {formatDateEt(a.cancelled_at)}
            </p>
            {a.cancel_reason && (
              <p className="mt-0.5 text-sm break-words whitespace-pre-line text-muted-foreground">{a.cancel_reason}</p>
            )}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          {meta.map((part, i) => (
            <span key={i} className="flex items-center gap-x-1.5">
              {i > 0 && (
                <span aria-hidden className="text-border">
                  ·
                </span>
              )}
              {part}
            </span>
          ))}
          {a.deal_title &&
            (onOpenDeal ? (
              <button
                type="button"
                onClick={onOpenDeal}
                className="max-w-56 truncate rounded-md bg-muted px-1.5 py-px text-[11px] font-medium text-foreground/70 transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                {a.deal_title}
              </button>
            ) : null)}
        </div>
      </div>
      {(onEdit || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Entry actions"
            className="h-fit shrink-0 rounded p-1 text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 aria-expanded:opacity-100 pointer-coarse:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-36">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
            )}
            {onEdit && onDelete && <DropdownMenuSeparator />}
            {onDelete && (
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
