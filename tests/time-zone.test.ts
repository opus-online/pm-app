import { describe, it, expect } from "vitest";
import { APP_TIME_ZONE, appClockTime, appDayKey, shiftDayKey } from "@/lib/time-zone";

describe("app time zone", () => {
  it("is Estonian time", () => {
    expect(APP_TIME_ZONE).toBe("Europe/Tallinn");
  });

  it("formats clock time in Tallinn (summer UTC+3, winter UTC+2)", () => {
    expect(appClockTime("2026-07-01T11:05:00Z")).toBe("14:05");
    expect(appClockTime("2026-01-15T11:05:00Z")).toBe("13:05");
    expect(appClockTime("2026-01-15T22:00:00Z")).toBe("00:00");
  });

  it("splits days at Tallinn midnight, not UTC midnight", () => {
    expect(appDayKey("2026-10-05T21:30:00Z")).toBe("2026-10-06");
    expect(appDayKey("2026-10-05T20:59:00Z")).toBe("2026-10-05");
  });

  it("shifts a day key by calendar days", () => {
    expect(shiftDayKey("2026-10-06", -1)).toBe("2026-10-05");
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("finds yesterday across the spring-forward night (last Sunday of March)", () => {
    // 00:30 on Mon Mar 30 in Tallinn; 24 h earlier is still Sat Mar 28 (the Sunday had 23 h).
    const now = Date.parse("2026-03-29T21:30:00Z");
    expect(appDayKey(now)).toBe("2026-03-30");
    expect(appDayKey(now - 86_400_000)).toBe("2026-03-28");
    expect(shiftDayKey(appDayKey(now), -1)).toBe("2026-03-29");
  });
});
