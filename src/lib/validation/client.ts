import { z } from "zod";
import { blankToNull } from "@/lib/validation/sales";

/** Blank/whitespace-only optional text collapses to null so the DB never stores "". */
function nullableText(max = 4000) {
  return z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null));
}

const nullableEmail = z
  .string()
  .max(320)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email");

/** Same http(s)-only guard as sales.ts's `httpUrl`, mirrored instead of imported: that one is
 * built with z.preprocess, which widens z.input<> to `unknown` for this field and breaks the
 * typed <Input value={...}> binding in client-form.tsx -- the refine-based style here (matching
 * nullableEmail above) keeps the input type as a plain nullable string. */
const nullableWebsite = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine(
    (v) => !v || z.url({ protocol: /^https?$/ }).safeParse(v).success,
    "Enter a valid http(s) URL"
  );

/** Blank collapses to null, same as every other optional field here -- mirrors contactSchema's
 * gender guard in validation/sales.ts. */
const nullableGender = z.preprocess(
  blankToNull,
  z.enum(["female", "male", "other"]).nullable().optional().transform((v) => v ?? null)
);

/** One repeatable contact row in the client form -> one client_contacts row. The form collects
 * first_name/last_name (gender + description are edited only in the Sales contact dialog, not
 * here -- see client-form.tsx); `name` is derived by a DB trigger from first/last and stays
 * optional here purely for backward compatibility with any pre-split caller. `id` rides along
 * (set for an existing row, absent for a new one) so upsertClientAction can update/insert/delete
 * by id instead of delete+reinserting every row on every save -- see that function for why. */
export const clientContactSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().max(200).optional(),
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: nullableText(100),
  gender: nullableGender,
  description: nullableText(2000),
  email: nullableEmail,
  phone: nullableText(50),
  role: nullableText(200),
  is_primary: z.boolean().optional().default(false),
});

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  // Company extras (P12 feedback): shared with the Sales company record -- reg_code is
  // case/space-insensitive unique across clients (DB functional unique index), enforced here
  // only as a friendly 23505 mapping in upsertClientAction, not a pre-check.
  reg_code: nullableText(40),
  email: nullableEmail,
  website: nullableWebsite,
  notes: nullableText(),
  // Multiple contact persons (P2 feedback). The legacy clients.contact_name/contact_email/phone
  // columns are no longer form fields -- upsertClientAction keeps them synced from whichever
  // row is primary, for the views/pages that still read them.
  contacts: z.array(clientContactSchema).max(50),
});
// `.input` (pre-transform shape) is what the form holds and the action receives from the
// client; `.output` (post-transform, e.g. "" -> null) is what safeParse hands back for the DB.
export type ClientInput = z.input<typeof clientSchema>;
export type ClientOutput = z.output<typeof clientSchema>;
export type ClientContactInput = z.input<typeof clientContactSchema>;
