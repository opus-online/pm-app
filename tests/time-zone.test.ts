import { describe, it, expect } from "vitest";
import { APP_TIME_ZONE, appClockTime, appDayKey } from "@/lib/time-zone";

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
});
