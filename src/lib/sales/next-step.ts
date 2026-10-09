export type NextStep = {
  activity_id: string;
  due_on: string;
  kind: "call" | "email" | "meeting" | "note";
  body: string;
  assignee: { id: string; name: string; avatar_url: string | null } | null;
  deal_id: string | null;
  contact_id: string | null;
};

/** The minimum of a sales_people() row toNextStep needs to name an assignee. */
export type StepPerson = { name: string | null; avatar_url: string | null };

/** A next-step view row (company_next_steps / deal_next_steps) or planned crm_activities row. */
export type NextStepSource = {
  activity_id: string | null;
  due_on: string | null;
  kind: NextStep["kind"] | "system" | null;
  body: string | null;
  assignee_id: string | null;
  deal_id: string | null;
  contact_id: string | null;
};

/** A next-step row as an allowlisted NextStep (field by field); null when the row is incomplete
 * or not a user-plannable kind. */
export function toNextStep(r: NextStepSource, people: Map<string, StepPerson>): NextStep | null {
  if (!r.activity_id || !r.due_on || r.body === null || !r.kind || r.kind === "system") return null;
  const person = r.assignee_id ? people.get(r.assignee_id) : undefined;
  return {
    activity_id: r.activity_id,
    due_on: r.due_on,
    kind: r.kind,
    body: r.body,
    assignee: r.assignee_id
      ? { id: r.assignee_id, name: person?.name ?? "Unknown", avatar_url: person?.avatar_url ?? null }
      : null,
    deal_id: r.deal_id,
    contact_id: r.contact_id,
  };
}
