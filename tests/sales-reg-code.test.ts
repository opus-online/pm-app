import { describe, it, expect } from "vitest";
import { normalizeRegCode } from "@/lib/sales/reg-code";
describe("normalizeRegCode", () => {
  it("strips whitespace and uppercases", () => expect(normalizeRegCode(" 12 345 678 ")).toBe("12345678"));
  it("handles letters", () => expect(normalizeRegCode("ee123abc")).toBe("EE123ABC"));
  it("empty → null", () => { expect(normalizeRegCode("  ")).toBeNull(); expect(normalizeRegCode(null)).toBeNull(); });
});
