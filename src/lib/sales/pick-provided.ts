/**
 * Shallow-copies `parsed` (a zod-parsed object) down to the keys the caller actually sent on
 * `raw` (the pre-parse input), dropping everything else.
 *
 * Needed because some validation/sales.ts field helpers (`text()`, `isoDate()`) run
 * `.optional().transform((v) => v ?? null)`, which turns an *absent* key into an explicit
 * `null` in the parsed output. For a full-replace write that's fine, but for a partial
 * `.update(...)` it would silently wipe a column the caller never touched (e.g. dragging a deal
 * to a new stage sending only `{ stage }` must not null out `next_follow_up_on`/`lost_reason`).
 * An explicit `{ next_follow_up_on: null }` from the caller is preserved, so clearing a field
 * still works -- only genuinely-omitted keys are dropped.
 */
export function pickProvided<T extends Record<string, unknown>>(parsed: T, raw: Record<string, unknown>): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(parsed) as (keyof T)[]) {
    if (Object.hasOwn(raw, key as string)) {
      result[key] = parsed[key];
    }
  }
  return result;
}
