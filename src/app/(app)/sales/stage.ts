import type { DealSource, DealStage } from "@/lib/sales/types";

export const STAGE_LABEL: Record<DealStage, string> = {
  new: "New",
  contacted: "Contacted",
  offer_sent: "Offer sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const STAGE_DOT: Record<DealStage, string> = {
  new: "bg-slate-400",
  contacted: "bg-sky-500",
  offer_sent: "bg-violet-500",
  negotiation: "bg-amber-500",
  won: "bg-emerald-500",
  lost: "bg-rose-500",
};

export const SOURCE_LABEL: Record<DealSource, string> = {
  inbound: "Inbound",
  outbound: "Outbound",
  referral: "Referral",
  existing_client: "Existing client",
  event: "Event",
  other: "Other",
};
