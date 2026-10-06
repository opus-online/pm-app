"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { deleteActivityAction } from "@/app/actions/sales";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatShortDate } from "../../../people/types";
import type { ActivityView } from "../../types";
import { KIND_META } from "./activity-kind";
import { useHydrated } from "./use-hydrated";

const DAY_MS = 86_400_000;

/** Day key + clock time. The server (and the hydration render) use UTC; after hydration the
 * viewer's own time zone takes over, so "14:05" means their 14:05 and days split at their
 * midnight. */
function dayKey(iso: string, local: boolean) {
  const d = new Date(iso);
  if (!local) return d.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeOf(iso: string, local: boolean) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: local ? undefined : "UTC",
  });
}

function dayLabel(key: string, todayKey: string, yesterdayKey: string) {
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return formatShortDate(key);
}

export function ActivityTimeline({
  activities,
  canManage,
  showDeal = true,
  emptyText,
}: {
  activities: ActivityView[];
  canManage: boolean;
  /** Off inside a deal's own panel, where the deal chip would only repeat the context. */
  showDeal?: boolean;
  emptyText?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const local = useHydrated();
  const [deleting, setDeleting] = useState<ActivityView | null>(null);

  // Captured once per mount: "Today" is relative to when the page was opened.
  const [now] = useState(() => Date.now());
  const todayKey = dayKey(new Date(now).toISOString(), local);
  const yesterdayKey = dayKey(new Date(now - DAY_MS).toISOString(), local);

  const groups: { key: string; items: ActivityView[] }[] = [];
  for (const a of activities) {
    const key = dayKey(a.occurred_at, local);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(a);
    else groups.push({ key, items: [a] });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Activity
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{activities.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {emptyText ?? (canManage ? "No activity yet — log the first call or email above." : "No activity yet.")}
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.key}>
                <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {dayLabel(g.key, todayKey, yesterdayKey)}
                </h3>
                <ol className="relative">
                  {g.items.map((a, i) => (
                    <TimelineItem
                      key={a.id}
                      activity={a}
                      local={local}
                      last={i === g.items.length - 1}
                      canDelete={canManage && a.is_mine && a.kind !== "system"}
                      onDelete={() => setDeleting(a)}
                      onOpenDeal={
                        showDeal && a.deal_id
                          ? () => router.replace(`${pathname}?deal=${a.deal_id}`, { scroll: false })
                          : undefined
                      }
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </CardContent>

      {canManage && (
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
      )}
    </Card>
  );
}

function TimelineItem({
  activity: a,
  local,
  last,
  canDelete,
  onDelete,
  onOpenDeal,
}: {
  activity: ActivityView;
  local: boolean;
  last: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onOpenDeal?: () => void;
}) {
  const system = a.kind === "system";
  const { icon: Icon, circle } = KIND_META[a.kind];

  const meta = [
    a.actor?.name ?? null,
    <span key="t" className="tabular-nums">{timeOf(a.occurred_at, local)}</span>,
    a.contact_name,
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
            circle
          )}
        >
          <Icon className={system ? "size-3" : "size-3.5"} />
        </span>
      </span>
      <div className={cn("min-w-0 flex-1", system ? "pt-0.5" : "pt-1")}>
        <p
          className={cn(
            "break-words whitespace-pre-line",
            system ? "text-xs text-muted-foreground" : "text-sm leading-relaxed"
          )}
        >
          {a.body}
        </p>
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
      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Entry actions"
            className="h-fit shrink-0 rounded p-1 text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 aria-expanded:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
