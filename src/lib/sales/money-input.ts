/** A typed euro amount: spaces group thousands ("36 000"), one comma or dot marks the decimals
 * ("36 000,50", "36000.5"). A lone separator followed by exactly three digits ("36,000") or a
 * mix of separators ("1.234,50") could be either a thousands group or decimals, so it is
 * "ambiguous" rather than guessed. Blank (or just "€") is null; anything else unreadable is
 * "invalid". */
export function parseAmountInput(raw: string): number | null | "ambiguous" | "invalid" {
  const s = raw.replace(/[\s€]/g, "");
  if (!s) return null;
  if (!/^-?[\d.,]+$/.test(s)) return "invalid";
  const separators = s.match(/[.,]/g) ?? [];
  if (separators.length > 1) {
    // Several of one kind ("1,234,567") or a mix ("1.234,50") reads as thousands grouping.
    return /^-?\d+([.,]\d+)+$/.test(s) ? "ambiguous" : "invalid";
  }
  if (separators.length === 1) {
    if (!/^-?\d+[.,]\d+$/.test(s)) return "invalid";
    if (/[.,]\d{3}$/.test(s)) return "ambiguous";
  }
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : "invalid";
}
