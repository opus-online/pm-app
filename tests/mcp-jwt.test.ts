import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { mintUserJwt } from "@/lib/mcp/user-client";

const SECRET = "test-jwt-secret-at-least-32-characters-long";
const USER_A = "10000003-0000-4000-8000-000000000003";
const USER_B = "10000007-0000-4000-8000-000000000007";

describe("mintUserJwt", () => {
  it("verifies with the same secret", async () => {
    const token = await mintUserJwt(USER_A, SECRET);
    const key = new TextEncoder().encode(SECRET);
    await expect(jwtVerify(token, key)).resolves.toBeTruthy();
  });

  it("fails verification with the wrong secret", async () => {
    const token = await mintUserJwt(USER_A, SECRET);
    const wrongKey = new TextEncoder().encode("a-completely-different-secret-value");
    await expect(jwtVerify(token, wrongKey)).rejects.toThrow();
  });

  it("has the exact claims: sub, role, aud, exp, iat", async () => {
    const token = await mintUserJwt(USER_A, SECRET);
    const key = new TextEncoder().encode(SECRET);
    const { payload, protectedHeader } = await jwtVerify(token, key);

    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe(USER_A);
    expect(payload.role).toBe("authenticated");
    expect(payload.aud).toBe("authenticated");
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
  });

  it("defaults to a 5-minute (300s) ttl", async () => {
    const token = await mintUserJwt(USER_A, SECRET);
    const key = new TextEncoder().encode(SECRET);
    const { payload } = await jwtVerify(token, key);
    expect((payload.exp as number) - (payload.iat as number)).toBe(300);
  });

  it("honors a custom ttl", async () => {
    const token = await mintUserJwt(USER_A, SECRET, 60);
    const key = new TextEncoder().encode(SECRET);
    const { payload } = await jwtVerify(token, key);
    expect((payload.exp as number) - (payload.iat as number)).toBe(60);
  });

  it("mints a different sub for a different user", async () => {
    const key = new TextEncoder().encode(SECRET);
    const tokenA = await mintUserJwt(USER_A, SECRET);
    const tokenB = await mintUserJwt(USER_B, SECRET);
    const { payload: a } = await jwtVerify(tokenA, key);
    const { payload: b } = await jwtVerify(tokenB, key);
    expect(a.sub).toBe(USER_A);
    expect(b.sub).toBe(USER_B);
    expect(a.sub).not.toBe(b.sub);
  });
});
