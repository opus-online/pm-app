// Per-key rate limit decision. The counter itself lives in the DB (`mcp_bump_usage(p_key_id)`
// increments and returns this minute's call count); this module only decides. Pure so it is
// unit-tested directly. Spec: 60 tool calls per key per minute; plus a coarser ceiling on ALL
// authenticated requests (any MCP method -- initialize, tools/list, ...) so non-tool traffic
// can't hammer the key resolver/DB unbounded.
export const RATE_LIMIT_PER_MINUTE = 60;
export const REQUEST_CEILING_PER_MINUTE = 300;

export const RATE_LIMIT_MESSAGE = "Rate limit reached, try again in a minute.";

/** `callsThisMinute` is the count AFTER bumping for the current call, so call #60 is allowed and
 * call #61 is refused. A non-finite/invalid count is treated as limited (fail closed). */
export function isRateLimited(callsThisMinute: number, limit: number = RATE_LIMIT_PER_MINUTE): boolean {
  if (!Number.isFinite(callsThisMinute)) return true;
  return callsThisMinute > limit;
}

/** Request ceiling: `requestsThisMinute` is the count after bumping for this request, so request
 * #300 is allowed and #301 gets HTTP 429. Invalid counts fail closed. */
export function isOverRequestCeiling(requestsThisMinute: number, ceiling: number = REQUEST_CEILING_PER_MINUTE): boolean {
  return isRateLimited(requestsThisMinute, ceiling);
}
