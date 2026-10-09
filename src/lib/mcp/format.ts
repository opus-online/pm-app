// Output helpers shared by every MCP tool. Pure (no "server-only") so tool modules stay
// importable from vitest. Spec: docs/superpowers/specs/2026-10-09-ai-assistant-mcp-design.md --
// dates dd.mm.yyyy, absolute app links, concise lists (<= 50 rows, truncation stated).
import { formatDateEt } from "@/lib/sales/date-format";

/** Hard cap on rows any list-style tool returns. */
export const MAX_ROWS = 50;

/** dd.mm.yyyy for a date key or ISO timestamp; null stays null (omitted from JSON output). */
export function fmtDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return formatDateEt(value);
}

/** Absolute app URL for an in-app path, rooted at NEXT_PUBLIC_SITE_URL. */
export function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Drops null/undefined/empty-string fields so RLS-withheld (null) finance columns are simply
 * absent from the output rather than rendered as misleading zeros or nulls. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Wraps a list result: caps at MAX_ROWS and says so when more exist. `total` is the full match
 * count when known (PostgREST count), otherwise rows.length is used. */
export function listResult<T>(key: string, rows: T[], total?: number | null) {
  const count = total ?? rows.length;
  const shown = rows.slice(0, MAX_ROWS);
  const result: Record<string, unknown> = { [key]: shown, count };
  if (count > shown.length) {
    result.truncated = `Showing ${shown.length} of ${count}. Narrow the filters to see the rest.`;
  }
  return result;
}

/** Serialises a tool result as compact JSON text. */
export function toText(value: unknown): string {
  return JSON.stringify(value);
}

/** Round to 1 decimal (hours, percentages). */
export function round1(n: number | null | undefined): number | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}
