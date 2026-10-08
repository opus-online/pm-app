import { describe, it, expect } from "vitest";
import { timelineAt, visibleInTimeline } from "@/lib/sales/timeline-filter";

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

describe("timelineAt", () => {
  const base = { occurred_at: "2026-10-01T09:00:00Z", done_at: null, cancelled_at: null };
  it("uses occurred_at for a plain entry", () => {
    expect(timelineAt(base)).toBe("2026-10-01T09:00:00Z");
  });
  it("puts a completed step on its done day", () => {
    expect(timelineAt({ ...base, done_at: "2026-10-05T09:00:00Z" })).toBe("2026-10-05T09:00:00Z");
  });
  it("puts a cancelled step on its cancel day", () => {
    expect(timelineAt({ ...base, cancelled_at: "2026-10-06T12:30:00Z" })).toBe("2026-10-06T12:30:00Z");
  });
});
