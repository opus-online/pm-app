import { describe, it, expect } from "vitest";
import { generateKey, hashKey } from "@/lib/mcp/keys";

describe("generateKey", () => {
  it("produces a key with the pmk_ prefix", () => {
    const { key } = generateKey();
    expect(key.startsWith("pmk_")).toBe(true);
  });

  it("produces a key using only base64url-safe characters after the prefix", () => {
    const { key } = generateKey();
    expect(key.slice(4)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("encodes 32 random bytes (43 base64url chars, no padding) after the prefix", () => {
    const { key } = generateKey();
    expect(key.slice(4)).toHaveLength(43);
    expect(key).not.toContain("=");
  });

  it("returns a 10-char display prefix that is a literal slice of the key", () => {
    const { key, prefix } = generateKey();
    expect(prefix).toHaveLength(10);
    expect(prefix).toBe(key.slice(0, 10));
  });

  it("returns a sha256 hex hash of the key", () => {
    const { key, hash } = generateKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashKey(key));
  });

  it("generates different keys (and hashes) on each call", () => {
    const a = generateKey();
    const b = generateKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashKey", () => {
  it("is deterministic for the same input", () => {
    const key = "pmk_sometestvaluethatislongenough";
    expect(hashKey(key)).toBe(hashKey(key));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashKey("pmk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).not.toBe(
      hashKey("pmk_bbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
    );
  });
});
