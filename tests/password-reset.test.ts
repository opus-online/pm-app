import { describe, it, expect } from "vitest";
import { decideRedirect } from "@/lib/auth/gate";
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/auth";

const anon = { isAuthenticated: false, status: null } as const;
const active = { isAuthenticated: true, status: "active" } as const;

describe("password reset routing", () => {
  it("lets signed-out users reach the forgot-password page and the email link handler", () => {
    expect(decideRedirect({ pathname: "/forgot-password", ...anon })).toBeNull();
    expect(decideRedirect({ pathname: "/auth/confirm", ...anon })).toBeNull();
  });

  it("keeps the new-password page behind a session", () => {
    expect(decideRedirect({ pathname: "/reset-password", ...anon })).toBe("/login");
    expect(decideRedirect({ pathname: "/reset-password", ...active })).toBeNull();
  });
});

describe("password schemas", () => {
  it("forgot password needs a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "mari@opus.ee" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("a new password follows the account rules and must be typed twice the same", () => {
    expect(resetPasswordSchema.safeParse({ password: "Strongpass12A", confirm: "Strongpass12A" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: "short1A", confirm: "short1A" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "alllowercase12", confirm: "alllowercase12" }).success).toBe(false);
    const mismatch = resetPasswordSchema.safeParse({ password: "Strongpass12A", confirm: "Strongpass12B" });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirm"]);
  });

  it("changing needs the current password and a different new one", () => {
    const ok = { current: "Oldpassword12", password: "Strongpass12A", confirm: "Strongpass12A" };
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, current: "" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, current: "Strongpass12A" }).success).toBe(false);
  });
});
