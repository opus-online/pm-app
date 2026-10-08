export type TimelineMode = "entries" | "all";

/** "entries" hides the auto-generated system rows (reassigned/rescheduled notices) so the
 * timeline reads like a log of what a person did; "all" shows everything, system included. */
export function visibleInTimeline(a: { kind: string; status: string }, mode: TimelineMode): boolean {
  if (mode === "all") return true;
  return a.kind !== "system";
}
