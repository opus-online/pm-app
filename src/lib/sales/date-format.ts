import { appDayKey } from "@/lib/time-zone";

/** "dd.mm.yyyy" for a date-only key or an ISO timestamp (rendered on its APP_TIME_ZONE day);
 * null → an em dash. */
export function formatDateEt(value: string | null): string {
  if (!value) return "—";
  const key = value.length === 10 ? value : appDayKey(new Date(value));
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}
