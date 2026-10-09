import { normalizeRegCode } from "@/lib/sales/reg-code";

export type ListFilter = { from: string | null; to: string | null; responsible: string | null | "nobody" };

type StepLite = { due_on: string; assignee: { id: string } | null } | null;

/** ISO date strings compare correctly with plain `<`/`>` (same format, same length). */
export function matchesStepFilter(step: StepLite, f: ListFilter): boolean {
  if (f.from || f.to) {
    if (!step) return false;
    if (f.from && step.due_on < f.from) return false;
    if (f.to && step.due_on > f.to) return false;
  }
  if (f.responsible === "nobody") {
    if (step && step.assignee) return false;
  } else if (f.responsible) {
    if (!step || step.assignee?.id !== f.responsible) return false;
  }
  return true;
}

/** Digits-only view of a phone-ish string (same matching rule as the clients search). */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

type QueryableCompany = {
  name: string;
  reg_code: string | null;
  next_step: { body: string } | null;
  contacts: { name: string; email: string | null; phone: string | null }[];
};

/** The Sales list's text search. `query` is already trimmed and lower-cased. Matches the company
 * name, registry code (normalized), next-step text, or a contact's name/email/phone. */
export function matchesCompanyQuery(row: QueryableCompany, query: string): boolean {
  if (row.name.toLowerCase().includes(query)) return true;
  const regQuery = normalizeRegCode(query);
  const reg = normalizeRegCode(row.reg_code);
  if (regQuery && reg && reg.includes(regQuery)) return true;
  if (row.next_step && row.next_step.body.toLowerCase().includes(query)) return true;
  // Phone matching compares digit-to-digit; require at least 3 query digits so a lone "1"
  // in a mixed query doesn't light up every row.
  const queryDigits = digits(query);
  return row.contacts.some(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      (c.email !== null && c.email.toLowerCase().includes(query)) ||
      (c.phone !== null &&
        (c.phone.toLowerCase().includes(query) ||
          (queryDigits.length >= 3 && digits(c.phone).includes(queryDigits))))
  );
}
