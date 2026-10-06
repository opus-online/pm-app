import { describe, it, expect } from "vitest";
import { pickProvided } from "@/lib/sales/pick-provided";
import { dealUpdateSchema } from "@/lib/validation/sales";

describe("pickProvided", () => {
  it("keeps only the stage key when only {stage} was sent, even though the schema nulls out untouched date/text fields", () => {
    const raw = { stage: "won" as const };
    const parsed = dealUpdateSchema.parse(raw);
    expect(parsed).toMatchObject({ next_follow_up_on: null, lost_reason: null });
    expect(pickProvided(parsed, raw)).toEqual({ stage: "won" });
  });

  it("preserves an explicit null so the caller can still clear next_follow_up_on", () => {
    const raw = { next_follow_up_on: null };
    const parsed = dealUpdateSchema.parse(raw);
    expect(pickProvided(parsed, raw)).toEqual({ next_follow_up_on: null });
  });

  it("does not include lost_reason when only title was sent, even for a deal that is already lost", () => {
    const raw = { title: "x" };
    const parsed = dealUpdateSchema.parse(raw);
    const picked = pickProvided(parsed, raw);
    expect(picked).toEqual({ title: "x" });
    expect(Object.hasOwn(picked, "lost_reason")).toBe(false);
  });
});
