import type { NextStep } from "@/lib/sales/next-step";
import type { ActivityKind, DealSource, DealStage, OfferLite, OfferStatus } from "@/lib/sales/types";

// Allowlisted shapes sent to client components -- built field by field in load-pipeline.ts /
// load-companies.ts, never by spreading DB rows.
export type PipelineContact = { id: string; name: string; phone: string | null; email: string | null };

export type PipelineRow = {
  id: string;
  title: string;
  stage: DealStage;
  source: DealSource;
  won_at: string | null;
  client: { id: string; name: string; reg_code: string | null; kind: "prospect" | "client" };
  owner: { id: string; name: string; avatar_url: string | null };
  latest_offer_amount: number | null;
  offers: OfferLite[];
  next_step: NextStep | null;
};

/** One row of the sales list: a company with its open deals and its earliest planned step. */
export type CompanyRow = {
  id: string;
  name: string;
  reg_code: string | null;
  kind: "prospect" | "client";
  contacts: PipelineContact[];
  open_deals: { id: string; stage: DealStage }[];
  /** Sum of the latest offer of each open deal. */
  open_value: number;
  next_step: NextStep | null;
};

export type SalesOwnerOption = { id: string; name: string; avatar_url: string | null };
export type CompanyOption = { id: string; name: string; reg_code: string | null };

// ---- Company workspace (sales/companies/[id]) -- same allowlist rule: built field by field in
// that page, never by spreading DB rows. ----
export type CompanyView = {
  id: string;
  name: string;
  reg_code: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  kind: "prospect" | "client";
};

export type ContactView = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string;
  gender: "female" | "male" | "other" | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  description: string | null;
};

export type OfferView = {
  id: string;
  title: string;
  amount: number;
  status: OfferStatus;
  sent_on: string | null;
  valid_until: string | null;
  link_url: string | null;
  note: string | null;
  created_at: string;
};

export type DealView = {
  id: string;
  title: string;
  stage: DealStage;
  source: DealSource;
  owner: { id: string; name: string; avatar_url: string | null };
  next_follow_up_on: string | null;
  lost_reason: string | null;
  project_id: string | null;
  offers: OfferView[];
};

export type ActivityView = {
  id: string;
  kind: ActivityKind;
  body: string;
  occurred_at: string;
  deal_id: string | null;
  deal_title: string | null;
  contact_name: string | null;
  actor: { id: string; name: string; avatar_url: string | null } | null;
  is_mine: boolean;
};
