import { describe, it, expect } from "vitest";
import { formatDateEt } from "@/lib/sales/date-format";
describe("formatDateEt", () => {
  it("formats date-only values", () => expect(formatDateEt("2026-10-14")).toBe("14.10.2026"));
  it("formats timestamps on the Tallinn day", () => expect(formatDateEt("2026-10-13T22:30:00Z")).toBe("14.10.2026"));
  it("null → em dash", () => expect(formatDateEt(null)).toBe("—"));
});
