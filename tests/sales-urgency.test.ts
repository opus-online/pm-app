import { describe, it, expect } from "vitest";
import { daysUntil, compareDueDates } from "@/lib/sales/urgency";

describe("daysUntil", () => {
  const today = new Date("2026-10-06T12:00:00Z");
  it("is null without a date", () => expect(daysUntil(null, today)).toBeNull());
  it("counts calendar days", () => {
    expect(daysUntil("2026-10-06", today)).toBe(0);
    expect(daysUntil("2026-10-05", today)).toBe(-1);
    expect(daysUntil("2026-10-07", today)).toBe(1);
    expect(daysUntil("2026-11-05", today)).toBe(30);
  });
  it("takes today from the Tallinn clock, not UTC", () => {
    // 22:30Z on Oct 6 is already 01:30 on Oct 7 in Tallinn.
    const lateEvening = new Date("2026-10-06T22:30:00Z");
    expect(daysUntil("2026-10-07", lateEvening)).toBe(0);
    expect(daysUntil("2026-10-06", lateEvening)).toBe(-1);
    expect(daysUntil("2026-10-06", new Date("2026-10-06T20:30:00Z"))).toBe(0);
  });
  it("stays whole days across the spring-forward night", () =>
    expect(daysUntil("2026-03-30", new Date("2026-03-28T23:30:00Z"))).toBe(1));
});
describe("compareDueDates", () => {
  it("puts overdue first and undated last", () => {
    const rows = [null, "2026-10-10", "2026-10-01"];
    expect(rows.sort(compareDueDates)).toEqual(["2026-10-01", "2026-10-10", null]);
  });
});
