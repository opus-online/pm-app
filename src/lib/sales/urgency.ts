const DAY = 86_400_000;
function utcMidnight(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole UTC calendar days between `today` and `dateISO` (negative = overdue, 0 = today). */
export function followUpDays(dateISO: string | null, today: Date = new Date()): number | null {
  if (!dateISO) return null;
  const [y, m, d] = dateISO.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - utcMidnight(today)) / DAY);
}

/** Sort comparator: earliest follow-up first (overdue included), undated rows last. */
export function compareByFollowUp(a: { next_follow_up_on: string | null }, b: { next_follow_up_on: string | null }): number {
  if (a.next_follow_up_on === b.next_follow_up_on) return 0;
  if (!a.next_follow_up_on) return 1;
  if (!b.next_follow_up_on) return -1;
  return a.next_follow_up_on < b.next_follow_up_on ? -1 : 1;
}
