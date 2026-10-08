import { describe, it, expect } from "vitest";
import { singleId } from "@/lib/sales/preselect";

describe("singleId", () => {
  it("returns null for an empty list", () => expect(singleId([])).toBeNull());
  it("returns the id when exactly one item", () => expect(singleId([{ id: "a" }])).toBe("a"));
  it("returns null for more than one item", () => expect(singleId([{ id: "a" }, { id: "b" }])).toBeNull());
});
