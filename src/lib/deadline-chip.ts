// Same light+dark-safe border/bg/text triplet approach as CONSUMPTION_BADGE_CLASS (src/lib/budget.ts)
// and the "reveal" category style (activity/types.ts) -- one tone per urgency bucket: overdue red,
// today emerald, tomorrow amber, within-7d orange, later a quiet neutral. Deliberately its own
// buckets rather than deadlineCountdown's shared 14-day amber rule (lib/deadline.ts) -- that rule
// serves every OTHER surface (project header strip, list tables); this card's chip/countdown pair
// is tuned for "which of these needs me first" at a glance, so it gets a finer-grained scale.
export const OVERDUE_CHIP = "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-400";
export const TODAY_CHIP = "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-400";
export const TOMORROW_CHIP = "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-400";
export const SOON_CHIP = "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-400";
export const NEUTRAL_CHIP = "border-border bg-muted text-muted-foreground";

export function chipTone(days: number): string {
  if (days < 0) return OVERDUE_CHIP;
  if (days === 0) return TODAY_CHIP;
  if (days === 1) return TOMORROW_CHIP;
  if (days <= 7) return SOON_CHIP;
  return NEUTRAL_CHIP;
}

export function chipDate(dateISO: string, days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  // Day-first, no year -- the timeline never shows anything more than ~30 days out.
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
