import { daysUntil } from "./urgency";

export type NextStep = {
  activity_id: string;
  due_on: string;
  kind: "call" | "email" | "meeting" | "note";
  body: string;
  assignee: { id: string; name: string; avatar_url: string | null } | null;
  deal_id: string | null;
  contact_id: string | null;
};

/** Count of steps due today or overdue (on the app's Tallinn clock). */
export function stepsDueCount(steps: { due_on: string }[], today: Date = new Date()): number {
  return steps.filter((s) => (daysUntil(s.due_on, today) ?? 1) <= 0).length;
}
