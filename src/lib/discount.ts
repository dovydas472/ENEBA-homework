/**
 * "-NN%" for one offer: how much cheaper than the MSRP, in WHOLE percent rounded down - the same rule the
 * server uses for the listing (pkg/catalog, discount_pct). Only integers: cents in, whole percent out.
 * null = no MSRP, or the price is not lower (then no badge is shown).
 */
export function discountPercent(priceCents: number | null, msrpCents: number | null): number | null {
  if (priceCents === null || msrpCents === null || msrpCents <= 0 || priceCents >= msrpCents) return null;
  return Math.floor(((msrpCents - priceCents) * 100) / msrpCents);
}
