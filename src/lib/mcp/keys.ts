import { randomBytes, createHash } from "node:crypto";

// Spec: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md (Key format & storage).
// `pmk_` + 32 random bytes, base64url-encoded (43 chars, unpadded) -- 47 chars total. Only the
// sha256 hex digest and a 10-char display prefix (a literal slice of the full key, not a
// separately-derived value) are ever persisted; the full key is returned once, by the caller,
// and never stored.
const KEY_PREFIX = "pmk_";
const RANDOM_BYTES = 32;
const DISPLAY_PREFIX_LEN = 10;

export type GeneratedKey = {
  /** The full secret, shown to the user once. Never persisted. */
  key: string;
  /** sha256(key) hex digest -- what actually gets stored (mcp_keys.key_hash). */
  hash: string;
  /** First 10 chars of `key`, safe to store/display (mcp_keys.key_prefix). */
  prefix: string;
};

export function generateKey(): GeneratedKey {
  const key = `${KEY_PREFIX}${randomBytes(RANDOM_BYTES).toString("base64url")}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, DISPLAY_PREFIX_LEN) };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
