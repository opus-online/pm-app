const EUR = new Intl.NumberFormat("et-EE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const AMOUNT = new Intl.NumberFormat("et-EE", { maximumFractionDigits: 0 });

/** Plain grouped number for cells whose header already names the currency ("Offer (€)"). */
export function formatAmount(n: number | null): string {
  return n === null ? "—" : AMOUNT.format(n);
}

export function formatEur(n: number | null): string {
  return n === null ? "—" : EUR.format(n);
}
