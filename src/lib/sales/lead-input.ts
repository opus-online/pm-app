import type { NewLeadInput } from "@/lib/validation/sales";

/** Pre-validation normalisation for a new lead, shared by createLeadAction and the MCP
 * create_lead tool. Always returns a fresh shallow copy (never the caller's object):
 * - attaching to an existing company drops stale new-company fields, so moot fields can't block
 *   the submission with validation errors;
 * - an optional first step defaults its assignee to the deal owner. */
export function prepareLeadInput(input: NewLeadInput): NewLeadInput {
  const raw: NewLeadInput = input.client_id ? { ...input, company: undefined } : { ...input };
  if (raw.step && !raw.step.assignee_id) {
    raw.step = { ...raw.step, assignee_id: raw.deal?.owner_id ?? null };
  }
  return raw;
}
