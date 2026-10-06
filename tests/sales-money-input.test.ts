import { describe, it, expect } from "vitest";
import { parseAmountInput } from "@/lib/sales/money-input";

describe("parseAmountInput", () => {
  it.each([
    ["36000", 36000],
    ["36 000", 36000],
    ["36 000,50", 36000.5],
    ["36000.5", 36000.5],
    ["€ 1 200", 1200],
    ["36,5", 36.5],
    ["1 200 000", 1200000],
    ["36 000", 36000], // no-break space (pasted from a document)
    ["0", 0],
  ])("reads %j as %d", (raw, expected) => expect(parseAmountInput(raw)).toBe(expected));

  it.each(["36,000", "36.000", "1,234,567", "1.234,50", "1,234.50"])(
    "rejects %j as ambiguous (a thousands separator or a decimal?)",
    (raw) => expect(parseAmountInput(raw)).toBe("ambiguous")
  );

  it.each(["", "   ", "€"])("treats %j as not set", (raw) => expect(parseAmountInput(raw)).toBeNull());

  it.each(["abc", "12a", "1..2", "-"])("treats %j as invalid", (raw) => expect(parseAmountInput(raw)).toBe("invalid"));

  it("keeps the sign so the schema can reject negatives", () => expect(parseAmountInput("-5")).toBe(-5));
});
