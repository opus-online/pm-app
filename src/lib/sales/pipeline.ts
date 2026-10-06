import { DEAL_STAGES, OPEN_STAGES, type DealLite, type DealStage, type OfferLite } from "./types";
import { followUpDays } from "./urgency";

const offerTime = (o: OfferLite) => o.sent_on ?? o.created_at.slice(0, 10);

/** Most recent offer by sent_on, falling back to created_at when unsent; null with no offers. */
export function latestOffer(offers: OfferLite[]): OfferLite | null {
  if (offers.length === 0) return null;
  return [...offers].sort((a, b) =>
    offerTime(a) < offerTime(b) ? 1 : offerTime(a) > offerTime(b) ? -1 : b.created_at.localeCompare(a.created_at)
  )[0];
}

const value = (d: DealLite) => latestOffer(d.offers)?.amount ?? 0;

export function pipelineTotals(deals: DealLite[], today: Date = new Date()) {
  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const monthKey = today.toISOString().slice(0, 7);
  return {
    openCount: open.length,
    pipelineValue: open.reduce((s, d) => s + value(d), 0),
    dueCount: open.filter((d) => {
      const n = followUpDays(d.next_follow_up_on, today);
      return n !== null && n <= 0;
    }).length,
    wonThisMonthValue: deals
      .filter((d) => d.stage === "won" && d.won_at?.slice(0, 7) === monthKey)
      .reduce((s, d) => s + value(d), 0),
  };
}

export function stageTotals(deals: DealLite[]): Record<DealStage, { count: number; value: number }> {
  const out = Object.fromEntries(DEAL_STAGES.map((s) => [s, { count: 0, value: 0 }])) as Record<
    DealStage,
    { count: number; value: number }
  >;
  for (const d of deals) {
    out[d.stage].count += 1;
    out[d.stage].value += value(d);
  }
  return out;
}
