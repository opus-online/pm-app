import type { DealSource, DealStage, OfferStatus } from "@/lib/sales/types";

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

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
};

export const OFFER_STATUS_DOT: Record<OfferStatus, string> = {
  draft: "bg-slate-400",
  sent: "bg-violet-500",
  accepted: "bg-emerald-500",
  rejected: "bg-rose-500",
};
