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
  /** Open deals with title, stage and latest offer amount (null when none). */
  open_deals: { id: string; title: string; stage: DealStage; offer: number | null }[];
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
  /** The deal's earliest planned step. */
  next_step: NextStep | null;
  lost_reason: string | null;
  project_id: string | null;
  offers: OfferView[];
};

type PersonRef = { id: string; name: string; avatar_url: string | null };

/** A timeline entry (status done). Entries that started as a planned step carry who completed
 * it and when (`done_at`, noon of the done day); everything else has those null. */
export type ActivityView = {
  id: string;
  kind: ActivityKind;
  body: string;
  occurred_at: string;
  deal_id: string | null;
  deal_title: string | null;
  contact_name: string | null;
  actor: PersonRef | null;
  is_mine: boolean;
  status: "planned" | "done" | "cancelled";
  due_on: string | null;
  assignee: PersonRef | null;
  done_at: string | null;
  done_by: PersonRef | null;
  done_comment: string | null;
};

/** An open planned step on the company page, with its contact / deal names resolved. */
export type NextStepView = NextStep & { contact_name: string | null; deal_title: string | null };
