import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deadlineCountdown } from "@/lib/deadline";
import { daysUntil } from "@/lib/dashboard";
import { chipTone, chipDate } from "@/lib/deadline-chip";
import { cn } from "@/lib/utils";
import type { DeadlineEntry } from "./compute";

// Right-side countdown text tone -- mirrors chipTone's buckets exactly (not deadlineCountdown's
// own toneClass, which uses its shared 14-day rule) so the chip and the countdown never disagree
// about how urgent a row is.
const OVERDUE_TONE = "text-red-700 dark:text-red-400";
const TODAY_TONE = "text-emerald-700 dark:text-emerald-400";
const TOMORROW_TONE = "text-amber-700 dark:text-amber-400";
const SOON_TONE = "text-orange-700 dark:text-orange-400";
const NEUTRAL_TONE = "text-muted-foreground";

function countdownTone(days: number): string {
  if (days < 0) return OVERDUE_TONE;
  if (days === 0) return TODAY_TONE;
  if (days === 1) return TOMORROW_TONE;
  if (days <= 7) return SOON_TONE;
  return NEUTRAL_TONE;
}

// Overdue + next-30-days project deadlines and undone milestones -- Task 2's buildDeadlineTimeline
// already merged, sorted (ascending by date), and capped this at 8; this just renders the list.
export function DeadlinesCard({ entries }: { entries: DeadlineEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Deadlines</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" render={<Link href="/projects" />}>
            View projects
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nothing due in the next 30 days.</p>
        ) : (
          <ul className="-mx-2">
            {entries.map((entry, i) => {
              const days = daysUntil(entry.date);
              const countdown = deadlineCountdown(entry.date, "short");
              return (
                <li key={`${entry.kind}-${entry.projectId}-${entry.date}-${i}`}>
                  <Link
                    href={`/projects/${entry.projectId}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <Badge variant="outline" className={cn("shrink-0 tabular-nums", chipTone(days))}>
                      {chipDate(entry.date, days)}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{entry.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{entry.projectName}</span>
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums whitespace-nowrap ${countdownTone(days)}`}
                    >
                      {countdown.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
