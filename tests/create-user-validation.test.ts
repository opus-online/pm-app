import { describe, it, expect } from "vitest";
import { createUserSchema } from "@/lib/validation/auth";

const base = { fullName: "Mari Maasikas", email: "Mari@Opus.ee ", role: "member" as const, sales: true };

describe("createUserSchema", () => {
  it("accepts a strong password and normalises the email", () => {
    const r = createUserSchema.parse({ ...base, password: "Strongpass12A" });
    expect(r.email).toBe("mari@opus.ee");
  });
  it("rejects short passwords", () => {
    expect(createUserSchema.safeParse({ ...base, password: "Short1A" }).success).toBe(false);
  });
  it("requires upper, lower and digit", () => {
    expect(createUserSchema.safeParse({ ...base, password: "alllowercase12" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: "ALLUPPERCASE12" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: "NoDigitsHereAtAll" }).success).toBe(false);
  });
  it("rejects the sales add-on as a main role", () => {
    expect(createUserSchema.safeParse({ ...base, role: "sales", password: "Strongpass12A" }).success).toBe(false);
  });
});
