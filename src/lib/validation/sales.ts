import { z } from "zod";
import { DEAL_SOURCES, DEAL_STAGES, OFFER_STATUSES, ACTIVITY_KINDS } from "@/lib/sales/types";

export const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional().transform((v) => v ?? null));
const email = z.preprocess(blankToNull, z.email("Enter a valid email").max(320).nullable().optional().transform((v) => v ?? null));
export const httpUrl = z.preprocess(
  blankToNull,
  z.url({ protocol: /^https?$/, error: "Enter a valid http(s) URL" }).max(2000).nullable().optional().transform((v) => v ?? null)
);
const isoDate = z.preprocess(blankToNull, z.iso.date().nullable().optional().transform((v) => v ?? null));

export const companySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  reg_code: text(40),
  phone: text(60),
  email,
  website: httpUrl,
  notes: text(5000),
});
export const contactSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: text(100),
  gender: z.preprocess(blankToNull, z.enum(["female", "male", "other"]).nullable().optional().transform((v) => v ?? null)),
  email,
  phone: text(60),
  role: text(120),
  description: text(2000),
});
export const dealFieldsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  source: z.enum(DEAL_SOURCES),
  owner_id: z.uuid(),
  next_follow_up_on: isoDate,
});
export const newLeadSchema = z
  .object({
    client_id: z.uuid().nullable(),
    company: companySchema.partial({ name: true }).optional(),
    deal: dealFieldsSchema,
    contact: contactSchema.partial({ first_name: true }).optional(),
  })
  .refine((v) => v.client_id !== null || !!v.company?.name?.trim(), {
    path: ["company", "name"],
    message: "Pick a company or enter a name",
  });
export const dealUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    stage: z.enum(DEAL_STAGES).optional(),
    source: z.enum(DEAL_SOURCES).optional(),
    owner_id: z.uuid().optional(),
    next_follow_up_on: isoDate,
    lost_reason: text(500),
  })
  .refine((v) => v.stage !== "lost" || !!v.lost_reason, { path: ["lost_reason"], message: "Give a reason" });
export const offerSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  amount: z.coerce.number().min(0, "Amount can't be negative").max(99_999_999),
  status: z.enum(OFFER_STATUSES),
  sent_on: isoDate,
  valid_until: isoDate,
  link_url: httpUrl,
  note: text(2000),
});
export const activitySchema = z.object({
  client_id: z.uuid(),
  deal_id: z.uuid().nullable().optional(),
  contact_id: z.uuid().nullable().optional(),
  kind: z.enum(ACTIVITY_KINDS),
  body: z.string().trim().min(1, "Write something").max(5000),
  occurred_at: z.iso.datetime({ offset: true }).optional(),
  set_follow_up_on: isoDate,
});
export type CompanyInput = z.input<typeof companySchema>;
export type ContactInput = z.input<typeof contactSchema>;
export type NewLeadInput = z.input<typeof newLeadSchema>;
export type DealUpdateInput = z.input<typeof dealUpdateSchema>;
export type OfferInput = z.input<typeof offerSchema>;
export type ActivityInput = z.input<typeof activitySchema>;
