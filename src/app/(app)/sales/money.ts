const EUR = new Intl.NumberFormat("et-EE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function formatEur(n: number | null): string {
  return n === null ? "—" : EUR.format(n);
}
