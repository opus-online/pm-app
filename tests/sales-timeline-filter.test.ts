import { describe, it, expect } from "vitest";
import { visibleInTimeline } from "@/lib/sales/timeline-filter";

describe("visibleInTimeline", () => {
  it("'entries' mode hides system rows", () => {
    expect(visibleInTimeline({ kind: "system", status: "done" }, "entries")).toBe(false);
  });
  it("'entries' mode keeps done user rows", () => {
    expect(visibleInTimeline({ kind: "call", status: "done" }, "entries")).toBe(true);
  });
  it("'entries' mode keeps cancelled user rows", () => {
    expect(visibleInTimeline({ kind: "note", status: "cancelled" }, "entries")).toBe(true);
  });
  it("'all' mode keeps everything, including system", () => {
    expect(visibleInTimeline({ kind: "system", status: "done" }, "all")).toBe(true);
    expect(visibleInTimeline({ kind: "call", status: "planned" }, "all")).toBe(true);
  });
});
