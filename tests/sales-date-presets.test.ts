import { describe, expect, it } from "vitest";
import { presetRange } from "@/lib/sales/date-presets";

describe("presetRange", () => {
  it("overdue ends yesterday with an open start", () => {
    expect(presetRange("overdue", "2026-10-08")).toEqual({ from: null, to: "2026-10-07" });
  });

  it("today is a single day", () => {
    expect(presetRange("today", "2026-10-08")).toEqual({ from: "2026-10-08", to: "2026-10-08" });
  });

  it("weeks run Monday to Sunday (mid-week today)", () => {
    // 2026-10-08 is a Thursday.
    expect(presetRange("this_week", "2026-10-08")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(presetRange("next_week", "2026-10-08")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("a Sunday belongs to the week that started the Monday before", () => {
    expect(presetRange("this_week", "2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(presetRange("next_week", "2026-10-11")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("a Monday starts its own week", () => {
    expect(presetRange("this_week", "2026-10-12")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(presetRange("next_week", "2026-10-12")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });

  it("crosses month and year boundaries", () => {
    // 2026-12-31 is a Thursday.
    expect(presetRange("this_week", "2026-12-31")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(presetRange("next_week", "2026-12-31")).toEqual({ from: "2027-01-04", to: "2027-01-10" });
    expect(presetRange("overdue", "2027-01-01")).toEqual({ from: null, to: "2026-12-31" });
    // 2026-03-01 is a Sunday.
    expect(presetRange("this_week", "2026-03-01")).toEqual({ from: "2026-02-23", to: "2026-03-01" });
  });
});
