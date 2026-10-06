import { describe, it, expect } from "vitest";
import { followUpDays, compareByFollowUp } from "@/lib/sales/urgency";

const today = new Date("2026-10-06T23:30:00Z");
describe("followUpDays", () => {
  it("is null without a date", () => expect(followUpDays(null, today)).toBeNull());
  it("counts in UTC calendar days", () => {
    expect(followUpDays("2026-10-06", today)).toBe(0);
    expect(followUpDays("2026-10-05", today)).toBe(-1);
    expect(followUpDays("2026-10-07", today)).toBe(1);
  });
});
describe("compareByFollowUp", () => {
  it("puts overdue first and undated last", () => {
    const rows = [{ next_follow_up_on: null }, { next_follow_up_on: "2026-10-10" }, { next_follow_up_on: "2026-10-01" }];
    expect(rows.sort(compareByFollowUp).map((r) => r.next_follow_up_on)).toEqual(["2026-10-01", "2026-10-10", null]);
  });
});
