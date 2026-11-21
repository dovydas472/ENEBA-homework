// Money is stored and sent as integer cents; this is the ONE place where it becomes text.
const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

/**
 * 1199 -> "€11.99". An unknown price (null / undefined, e.g. out of stock) becomes "—".
 * The division by 100 happens only here, only for display - never store or add the result.
 */
export function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return euro.format(cents / 100);
}
