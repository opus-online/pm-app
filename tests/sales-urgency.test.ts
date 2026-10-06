import { describe, it, expect } from "vitest";
import { followUpDays, compareByFollowUp } from "@/lib/sales/urgency";

describe("followUpDays", () => {
  const today = new Date("2026-10-06T12:00:00Z");
  it("is null without a date", () => expect(followUpDays(null, today)).toBeNull());
  it("counts calendar days", () => {
    expect(followUpDays("2026-10-06", today)).toBe(0);
    expect(followUpDays("2026-10-05", today)).toBe(-1);
    expect(followUpDays("2026-10-07", today)).toBe(1);
    expect(followUpDays("2026-11-05", today)).toBe(30);
  });
  it("takes today from the Tallinn clock, not UTC", () => {
    // 22:30Z on Oct 6 is already 01:30 on Oct 7 in Tallinn.
    const lateEvening = new Date("2026-10-06T22:30:00Z");
    expect(followUpDays("2026-10-07", lateEvening)).toBe(0);
    expect(followUpDays("2026-10-06", lateEvening)).toBe(-1);
    expect(followUpDays("2026-10-06", new Date("2026-10-06T20:30:00Z"))).toBe(0);
  });
  it("stays whole days across the spring-forward night", () =>
    expect(followUpDays("2026-03-30", new Date("2026-03-28T23:30:00Z"))).toBe(1));
});
describe("compareByFollowUp", () => {
  it("puts overdue first and undated last", () => {
    const rows = [{ next_follow_up_on: null }, { next_follow_up_on: "2026-10-10" }, { next_follow_up_on: "2026-10-01" }];
    expect(rows.sort(compareByFollowUp).map((r) => r.next_follow_up_on)).toEqual(["2026-10-01", "2026-10-10", null]);
  });
});
