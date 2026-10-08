import { describe, it, expect } from "vitest";
import { latestOffer, offersNewestFirst, pipelineTotals, stageTotals } from "@/lib/sales/pipeline";
import type { DealLite } from "@/lib/sales/types";

const o = (amount: number, sent_on: string | null, created_at = "2026-09-01T00:00:00Z") =>
  ({ amount, status: "sent" as const, sent_on, created_at });
const today = new Date("2026-10-06T12:00:00Z");
const deals: DealLite[] = [
  { id: "a", stage: "negotiation", won_at: null, offers: [o(1000, "2026-08-01"), o(1500, "2026-09-01")] },
  { id: "b", stage: "new", won_at: null, offers: [] },
  { id: "c", stage: "won", won_at: "2026-10-02T10:00:00Z", offers: [o(4000, null)] },
  { id: "d", stage: "lost", won_at: null, offers: [o(9000, "2026-09-01")] },
];
describe("latestOffer", () => {
  it("picks most recent by sent_on, falling back to created_at", () => expect(latestOffer(deals[0].offers)?.amount).toBe(1500));
  it("is null with no offers", () => expect(latestOffer([])).toBeNull());
});
describe("offersNewestFirst", () => {
  it("orders by sent_on (else created day), newest first, without mutating the input", () => {
    const offers = [
      { amount: 1, status: "rejected" as const, sent_on: "2026-08-01", created_at: "2026-07-30T10:00:00Z" },
      { amount: 3, status: "draft" as const, sent_on: null, created_at: "2026-10-05T10:00:00Z" },
      { amount: 2, status: "sent" as const, sent_on: "2026-09-10", created_at: "2026-09-09T10:00:00Z" },
    ];
    expect(offersNewestFirst(offers).map((o) => o.amount)).toEqual([3, 2, 1]);
    expect(offers[0].amount).toBe(1);
  });
});
describe("pipelineTotals", () => {
  it("counts only open deals for pipeline", () =>
    expect(pipelineTotals(deals, today)).toEqual({ openCount: 2, pipelineValue: 1500, wonThisMonthValue: 4000 }));
});
describe("pipelineTotals month", () => {
  it("takes the month from the Tallinn clock for both today and won_at", () => {
    const won = (won_at: string): DealLite => ({ id: won_at, stage: "won", won_at, offers: [o(100, null)] });
    // 22:30Z on Sep 30 is already Oct 1 in Tallinn.
    const rows = [won("2026-09-30T22:30:00Z"), won("2026-09-30T20:00:00Z")];
    expect(pipelineTotals(rows, new Date("2026-10-01T09:00:00Z")).wonThisMonthValue).toBe(100);
    expect(pipelineTotals(rows, new Date("2026-09-30T22:30:00Z")).wonThisMonthValue).toBe(100);
    expect(pipelineTotals(rows, new Date("2026-09-30T20:30:00Z")).wonThisMonthValue).toBe(100);
  });
});
describe("stageTotals", () => {
  it("sums latest offer per stage", () => {
    const t = stageTotals(deals);
    expect(t.negotiation).toEqual({ count: 1, value: 1500 });
    expect(t.contacted).toEqual({ count: 0, value: 0 });
  });
});
