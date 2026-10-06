/** Mirrors the SQL normalize_reg_code: strip whitespace, uppercase, blank collapses to null. */
export function normalizeRegCode(code: string | null | undefined): string | null {
  const v = (code ?? "").replace(/\s/g, "").toUpperCase();
  return v === "" ? null : v;
}
