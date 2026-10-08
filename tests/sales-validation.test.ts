import { describe, it, expect } from "vitest";
import {
  companySchema,
  newLeadSchema,
  offerSchema,
  dealUpdateSchema,
  activitySchema,
  planStepSchema,
  completeStepSchema,
} from "@/lib/validation/sales";

describe("companySchema", () => {
  it("rejects javascript: websites", () =>
    expect(companySchema.safeParse({ name: "A", website: "javascript:alert(1)" }).success).toBe(false));
  it("accepts blank optional fields as null", () => {
    const r = companySchema.parse({ name: "A", reg_code: "", email: "", website: "" });
    expect(r).toMatchObject({ reg_code: null, email: null, website: null });
  });
});
describe("dealUpdateSchema", () => {
  it("requires a lost reason when lost", () => {
    expect(dealUpdateSchema.safeParse({ stage: "lost", lost_reason: "" }).success).toBe(false);
    expect(dealUpdateSchema.safeParse({ stage: "lost", lost_reason: "Too expensive" }).success).toBe(true);
  });
});
describe("offerSchema", () => {
  it("rejects negative amounts", () => expect(offerSchema.safeParse({ title: "v1", amount: -1, status: "draft" }).success).toBe(false));
});
describe("activitySchema", () => {
  it("does not allow system entries", () =>
    expect(activitySchema.safeParse({ client_id: crypto.randomUUID(), kind: "system", body: "x" }).success).toBe(false));
});
describe("newLeadSchema", () => {
  it("needs either an existing company or a new company name", () =>
    expect(newLeadSchema.safeParse({ client_id: null, company: { name: "" }, deal: { title: "X", source: "inbound", owner_id: crypto.randomUUID() } }).success).toBe(false));
});
describe("planStepSchema", () => {
  it("requires a due date and assignee", () =>
    expect(planStepSchema.safeParse({ client_id: crypto.randomUUID(), kind: "call", body: "Call", due_on: "", assignee_id: crypto.randomUUID() }).success).toBe(false));
  it("accepts a full step", () =>
    expect(planStepSchema.safeParse({ client_id: crypto.randomUUID(), kind: "call", body: "Call", due_on: "2026-10-14", assignee_id: crypto.randomUUID() }).success).toBe(true));
});
describe("completeStepSchema", () => {
  it("blank comment becomes null", () =>
    expect(completeStepSchema.parse({ activity_id: crypto.randomUUID(), done_on: "2026-10-14", done_by: crypto.randomUUID(), comment: "  " }).comment).toBeNull());
});
