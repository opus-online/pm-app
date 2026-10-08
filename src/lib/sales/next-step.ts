export type NextStep = {
  activity_id: string;
  due_on: string;
  kind: "call" | "email" | "meeting" | "note";
  body: string;
  assignee: { id: string; name: string; avatar_url: string | null } | null;
  deal_id: string | null;
  contact_id: string | null;
};
