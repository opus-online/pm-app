import { describe, it, expect } from "vitest";
import { matchesStepFilter, type ListFilter } from "@/lib/sales/list-filters";

const noFilter: ListFilter = { from: null, to: null, responsible: null };
const step = (due_on: string, assigneeId: string | null) => ({ due_on, assignee: assigneeId ? { id: assigneeId } : null });

describe("matchesStepFilter", () => {
  it("passes everything when no filter is set", () => {
    expect(matchesStepFilter(step("2026-10-10", "u1"), noFilter)).toBe(true);
    expect(matchesStepFilter(null, noFilter)).toBe(true);
  });

  it("from-only: keeps rows on/after the date, excludes earlier and no-step rows", () => {
    const f: ListFilter = { ...noFilter, from: "2026-10-10" };
    expect(matchesStepFilter(step("2026-10-10", "u1"), f)).toBe(true);
    expect(matchesStepFilter(step("2026-10-11", "u1"), f)).toBe(true);
    expect(matchesStepFilter(step("2026-10-09", "u1"), f)).toBe(false);
    expect(matchesStepFilter(null, f)).toBe(false);
  });

  it("to-only: keeps rows on/before the date, excludes later and no-step rows", () => {
    const f: ListFilter = { ...noFilter, to: "2026-10-10" };
    expect(matchesStepFilter(step("2026-10-10", "u1"), f)).toBe(true);
    expect(matchesStepFilter(step("2026-10-09", "u1"), f)).toBe(true);
    expect(matchesStepFilter(step("2026-10-11", "u1"), f)).toBe(false);
    expect(matchesStepFilter(null, f)).toBe(false);
  });

  it("from and to: both inclusive edges", () => {
    const f: ListFilter = { from: "2026-10-05", to: "2026-10-10", responsible: null };
    expect(matchesStepFilter(step("2026-10-05", "u1"), f)).toBe(true);
    expect(matchesStepFilter(step("2026-10-10", "u1"), f)).toBe(true);
    expect(matchesStepFilter(step("2026-10-04", "u1"), f)).toBe(false);
    expect(matchesStepFilter(step("2026-10-11", "u1"), f)).toBe(false);
    expect(matchesStepFilter(null, f)).toBe(false);
  });

  it("no-step rows pass when no date range is set, regardless of responsible", () => {
    expect(matchesStepFilter(null, { from: null, to: null, responsible: "nobody" })).toBe(true);
    expect(matchesStepFilter(null, { from: null, to: null, responsible: "u1" })).toBe(false);
  });

  it("responsible 'nobody' matches a step without an assignee, or no step at all, when no range is set", () => {
    const f: ListFilter = { from: null, to: null, responsible: "nobody" };
    expect(matchesStepFilter(step("2026-10-10", null), f)).toBe(true);
    expect(matchesStepFilter(null, f)).toBe(true);
    expect(matchesStepFilter(step("2026-10-10", "u1"), f)).toBe(false);
  });

  it("responsible id matches only that assignee", () => {
    const f: ListFilter = { from: null, to: null, responsible: "u1" };
    expect(matchesStepFilter(step("2026-10-10", "u1"), f)).toBe(true);
    expect(matchesStepFilter(step("2026-10-10", "u2"), f)).toBe(false);
    expect(matchesStepFilter(step("2026-10-10", null), f)).toBe(false);
    expect(matchesStepFilter(null, f)).toBe(false);
  });

  it("responsible null (any) does not filter by assignee", () => {
    const f: ListFilter = { from: null, to: null, responsible: null };
    expect(matchesStepFilter(step("2026-10-10", "u1"), f)).toBe(true);
    expect(matchesStepFilter(step("2026-10-10", null), f)).toBe(true);
  });

  it("combines range and responsible", () => {
    const f: ListFilter = { from: "2026-10-05", to: "2026-10-10", responsible: "nobody" };
    expect(matchesStepFilter(step("2026-10-07", null), f)).toBe(true);
    expect(matchesStepFilter(step("2026-10-07", "u1"), f)).toBe(false);
    expect(matchesStepFilter(step("2026-10-20", null), f)).toBe(false);
    expect(matchesStepFilter(null, f)).toBe(false);
  });
});
