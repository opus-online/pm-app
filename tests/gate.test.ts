import { describe, it, expect } from "vitest";
import { decideRedirect, safeNextPath } from "@/lib/auth/gate";

const anon = { isAuthenticated: false, status: null } as const;
const pending = { isAuthenticated: true, status: "pending" } as const;
const active = { isAuthenticated: true, status: "active" } as const;
const disabled = { isAuthenticated: true, status: "disabled" } as const;

describe("decideRedirect", () => {
  it("lets unauthenticated users reach public auth pages", () => {
    expect(decideRedirect({ pathname: "/login", ...anon })).toBeNull();
    expect(decideRedirect({ pathname: "/signup", ...anon })).toBeNull();
    expect(decideRedirect({ pathname: "/auth/callback", ...anon })).toBeNull();
  });

  it("sends unauthenticated users to /login from protected routes", () => {
    expect(decideRedirect({ pathname: "/dashboard", ...anon })).toBe("/login");
    expect(decideRedirect({ pathname: "/", ...anon })).toBe("/login");
    expect(decideRedirect({ pathname: "/pending", ...anon })).toBe("/login");
  });

  it("locks pending users to /pending", () => {
    expect(decideRedirect({ pathname: "/pending", ...pending })).toBeNull();
    expect(decideRedirect({ pathname: "/dashboard", ...pending })).toBe("/pending");
    expect(decideRedirect({ pathname: "/admin/users", ...pending })).toBe("/pending");
  });

  it("keeps active users out of auth pages and off /pending", () => {
    expect(decideRedirect({ pathname: "/login", ...active })).toBe("/dashboard");
    expect(decideRedirect({ pathname: "/pending", ...active })).toBe("/dashboard");
    expect(decideRedirect({ pathname: "/", ...active })).toBe("/dashboard");
    expect(decideRedirect({ pathname: "/dashboard", ...active })).toBeNull();
    expect(decideRedirect({ pathname: "/settings/sessions", ...active })).toBeNull();
  });

  it("sends disabled users to /login with an error flag", () => {
    expect(decideRedirect({ pathname: "/dashboard", ...disabled })).toBe(
      "/login?error=account_disabled"
    );
    expect(decideRedirect({ pathname: "/login", ...disabled })).toBeNull();
  });

  it("locks pending users out of the auth callback route", () => {
    expect(decideRedirect({ pathname: "/auth/callback", ...pending })).toBe(
      "/pending"
    );
  });

  it("still flags disabled users on the auth callback route", () => {
    expect(decideRedirect({ pathname: "/auth/callback", ...disabled })).toBe(
      "/login?error=account_disabled"
    );
  });

  it("lets active users through the auth callback route", () => {
    expect(decideRedirect({ pathname: "/auth/callback", ...active })).toBeNull();
  });

  it("still flags disabled users on /pending", () => {
    expect(decideRedirect({ pathname: "/pending", ...disabled })).toBe(
      "/login?error=account_disabled"
    );
  });

  it("does not treat prefix-similar paths as public for unauthenticated users", () => {
    expect(decideRedirect({ pathname: "/loginfoo", ...anon })).toBe("/login");
    expect(decideRedirect({ pathname: "/authorize", ...anon })).toBe("/login");
  });

  it("lets active users through unknown protected-looking paths", () => {
    expect(decideRedirect({ pathname: "/loginfoo", ...active })).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("allows only the OAuth consent page, same-origin", () => {
    expect(safeNextPath("/oauth/consent?authorization_id=abc")).toBe("/oauth/consent?authorization_id=abc");
    for (const bad of [
      null, "", "/dashboard", "//evil.com/oauth/consent", "https://evil.com/oauth/consent",
      "/oauth/consent/../dashboard", "/\evil.com", "oauth/consent", "/oauth/consentx",
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});

describe("decideRedirect with consent", () => {
  it("sends logged-out consent visits to login with next", () => {
    expect(decideRedirect({ pathname: "/oauth/consent", search: "?authorization_id=abc", isAuthenticated: false, status: null }))
      .toBe("/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc");
  });
  it("other logged-out visits still go to plain /login", () => {
    expect(decideRedirect({ pathname: "/dashboard", search: "?x=1", isAuthenticated: false, status: null })).toBe("/login");
  });
  it("an active user on /login with a safe next goes there, otherwise dashboard", () => {
    expect(decideRedirect({ pathname: "/login", search: "?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc", isAuthenticated: true, status: "active" }))
      .toBe("/oauth/consent?authorization_id=abc");
    expect(decideRedirect({ pathname: "/login", search: "?next=%2F%2Fevil.com", isAuthenticated: true, status: "active" }))
      .toBe("/dashboard");
  });
  it("active users may open the consent page", () => {
    expect(decideRedirect({ pathname: "/oauth/consent", search: "?authorization_id=abc", isAuthenticated: true, status: "active" })).toBeNull();
  });
});
