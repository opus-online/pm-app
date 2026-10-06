import type { DealSource, DealStage, OfferLite } from "@/lib/sales/types";

// Allowlisted shapes sent to client components -- built field by field in load-pipeline.ts,
// never by spreading DB rows.
export type PipelineContact = { id: string; name: string; phone: string | null; email: string | null };

export type PipelineRow = {
  id: string;
  title: string;
  stage: DealStage;
  source: DealSource;
  next_follow_up_on: string | null;
  won_at: string | null;
  client: { id: string; name: string; reg_code: string | null; kind: "prospect" | "client" };
  owner: { id: string; name: string; avatar_url: string | null };
  contacts: PipelineContact[];
  latest_offer_amount: number | null;
  offers: OfferLite[];
};

export type SalesOwnerOption = { id: string; name: string; avatar_url: string | null };
export type CompanyOption = { id: string; name: string; reg_code: string | null };
