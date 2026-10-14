import { describe, it, expect } from "vitest";
import { allRedirectUrisAllowed, consentProblem, isAllowedRedirectUri, isAllowedRedirectUrl } from "@/lib/mcp/oauth-consent";

describe("isAllowedRedirectUri", () => {
  it("allows Claude's callbacks and local clients", () => {
    for (const ok of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
      "http://localhost:53123/callback",
      "http://127.0.0.1:8080/oauth/callback",
    ]) expect(isAllowedRedirectUri(ok)).toBe(true);
  });
  it("refuses look-alikes and anything else", () => {
    for (const bad of [
      "https://claude.ai.evil.com/api/mcp/auth_callback",
      "http://claude.ai/api/mcp/auth_callback",
      "https://claude.ai/api/mcp/auth_callback?x=1",
      "https://claude.ai/api/mcp/other",
      "https://user@claude.ai/api/mcp/auth_callback",
      "https://evil.com/callback",
      "http://localhost.evil.com/cb",
      "javascript:alert(1)",
      "not a url",
    ]) expect(isAllowedRedirectUri(bad)).toBe(false);
  });
});

describe("consentProblem", () => {
  const me = "11111111-1111-4111-8111-111111111111";
  const ok = { redirect_uri: "https://claude.ai/api/mcp/auth_callback", user: { id: me } };
  it("is null for a valid request by the same user", () => {
    expect(consentProblem(ok, me)).toBeNull();
  });
  it("refuses another user's authorization", () => {
    expect(consentProblem(ok, "22222222-2222-4222-8222-222222222222")).toMatch(/different account/);
  });
  it("refuses a disallowed app", () => {
    expect(consentProblem({ ...ok, redirect_uri: "https://evil.com/cb" }, me)).toMatch(/isn't allowed/);
  });
});

describe("already-consented redirects (review Critical #1)", () => {
  it("allows a code redirect only to an allowlisted callback", () => {
    expect(isAllowedRedirectUrl("https://claude.ai/api/mcp/auth_callback?code=abc&state=xyz")).toBe(true);
    expect(isAllowedRedirectUrl("http://localhost:8765/callback?code=abc")).toBe(true);
    expect(isAllowedRedirectUrl("https://evil.com/cb?code=abc&state=xyz")).toBe(false);
    expect(isAllowedRedirectUrl("https://claude.ai.evil.com/api/mcp/auth_callback?code=abc")).toBe(false);
    expect(isAllowedRedirectUrl("https://claude.ai/api/mcp/auth_callback#code=abc")).toBe(false);
    expect(isAllowedRedirectUrl("garbage")).toBe(false);
  });
  it("requires every registered redirect URI of a client to be allowlisted", () => {
    expect(allRedirectUrisAllowed(["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"])).toBe(true);
    expect(allRedirectUrisAllowed(["https://claude.ai/api/mcp/auth_callback", "https://evil.com/cb"])).toBe(false);
    expect(allRedirectUrisAllowed([])).toBe(false);
  });
});
