import { appDayKey } from "@/lib/time-zone";

const DAY = 86_400_000;
const utcDay = (key: string) => {
  const [y, m, d] = key.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole calendar days from today (on the app's Tallinn clock) to `dateISO`; negative = overdue,
 * 0 = today. Both are date-only keys, so the subtraction is plain UTC calendar math. */
export function daysUntil(dateISO: string | null, today: Date = new Date()): number | null {
  if (!dateISO) return null;
  return Math.round((utcDay(dateISO) - utcDay(appDayKey(today))) / DAY);
}

/** Sort comparator: earliest due date first, undated rows last. */
export function compareDueDates(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}
