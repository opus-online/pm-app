import { shiftDayKey } from "@/lib/time-zone";

export type DatePreset = "overdue" | "today" | "this_week" | "next_week";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "next_week", label: "Next week" },
];

/** Monday ("YYYY-MM-DD") of the Mon–Sun week containing `dayKey`. */
function mondayOf(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return shiftDayKey(dayKey, -((dow + 6) % 7));
}

/** The inclusive from/to range a preset stands for, relative to `todayKey` (an app-time-zone day
 * key); null = open end. */
export function presetRange(preset: DatePreset, todayKey: string): { from: string | null; to: string | null } {
  switch (preset) {
    case "overdue":
      return { from: null, to: shiftDayKey(todayKey, -1) };
    case "today":
      return { from: todayKey, to: todayKey };
    case "this_week": {
      const mon = mondayOf(todayKey);
      return { from: mon, to: shiftDayKey(mon, 6) };
    }
    case "next_week": {
      const mon = shiftDayKey(mondayOf(todayKey), 7);
      return { from: mon, to: shiftDayKey(mon, 6) };
    }
  }
}
