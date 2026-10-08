import { describe, it, expect } from "vitest";
import { stepsDueCount } from "@/lib/sales/next-step";
import { compareDueDates, daysUntil } from "@/lib/sales/urgency";
const today = new Date("2026-10-06T12:00:00Z");
describe("next steps", () => {
  it("counts due today or overdue", () =>
    expect(stepsDueCount([{ due_on: "2026-10-05" }, { due_on: "2026-10-06" }, { due_on: "2026-10-07" }], today)).toBe(2));
  it("sorts earliest first, undated last", () =>
    expect([null, "2026-10-10", "2026-10-01"].sort(compareDueDates)).toEqual(["2026-10-01", "2026-10-10", null]));
  it("daysUntil keeps follow-up semantics", () => expect(daysUntil("2026-10-05", today)).toBe(-1));
});
