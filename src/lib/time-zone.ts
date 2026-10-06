/** The app's one wall-clock time zone. Server and browser format instants with it, so a
 * timestamp renders identically on both sides (no hydration mismatch, no post-hydration jump)
 * and "14:05" / day boundaries mean Estonian time for everyone. */
export const APP_TIME_ZONE = "Europe/Tallinn";

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "YYYY-MM-DD" of the instant's calendar day in the app time zone. */
export function appDayKey(instant: string | number | Date): string {
  const parts = DAY_KEY.formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "HH:mm" (24h) of the instant in the app time zone. */
export function appClockTime(instant: string | number | Date): string {
  return CLOCK.format(new Date(instant));
}

/** The "YYYY-MM-DD" key `days` calendar days from `key` -- calendar arithmetic, so a 23 h or
 * 25 h DST day can't skip or repeat a date the way "now - 24 h" does. */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
