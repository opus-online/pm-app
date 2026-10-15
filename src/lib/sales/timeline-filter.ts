export type TimelineMode = "entries" | "all";

/** "entries" hides the auto-generated system rows (reassigned/rescheduled notices) so the
 * timeline reads like a log of what a person did; "all" shows those too. Cancelled steps never
 * show (they stay in the database and the audit log). */
export function visibleInTimeline(a: { kind: string; status: string }, mode: TimelineMode): boolean {
  if (a.status === "cancelled") return false;
  if (mode === "all") return true;
  return a.kind !== "system";
}

/** When an entry sits in the timeline: a completed / cancelled step on the day it was closed,
 * everything else when it happened. */
export function timelineAt(a: { occurred_at: string; done_at: string | null; cancelled_at: string | null }): string {
  return a.done_at ?? a.cancelled_at ?? a.occurred_at;
}
