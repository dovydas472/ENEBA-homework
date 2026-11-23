// The cart's rules as PURE functions: they take the current lines and return new ones, never change
// their input and never touch localStorage or React. That makes every rule easy to test, and the store
// (cartStore.ts) only has to keep the current value and save it.
import type { CartLineInput, Offer, ProductDetail, ProductItem, CheckoutLine } from "../../api/types.ts";

/** localStorage key. The ":v1" is the format version: a future format gets a new key, old data is ignored. */
export const CART_STORAGE_KEY = "cart:v1";

/** Owner decision C2: at most 5 of one offer, and never more than the seller has in stock. */
export const MAX_QUANTITY_PER_LINE = 5;

/**
 * One cart line = one OFFER (C1): the same game from another seller is another line.
 * Everything except offerId and quantity is display data captured when the line was added (C3).
 * It is NOT trusted later: checkout asks the server for the real price and stock.
 */
export interface CartLine {
  offerId: number;
  quantity: number;
  productSlug: string;
  title: string;
  edition: string;
  platformName: string;
  regionName: string;
  coverUrl: string | null;
  sellerName: string;
  /** Integer cents, display only. */
  priceCents: number;
  /** Keys the seller had when the line was added; limits the quantity. */
  stock: number;
}

/** What "Add to cart" passes in: a line without the quantity. */
export type CartItem = Omit<CartLine, "quantity">;

/** added = new line, increased = quantity +1, max = the limit was already reached (nothing changed). */
export type AddResult = "added" | "increased" | "max";

/** The largest allowed quantity of an offer: min(stock, 5). */
export function maxQuantity(stock: number): number {
  return Math.max(0, Math.min(stock, MAX_QUANTITY_PER_LINE));
}

/**
 * Adds one piece of an offer. An offer already in the cart gets +1 (up to the limit) and its display data is
 * refreshed with the newer values (price, stock...); a new offer becomes a new line at the end.
 */
export function addItem(lines: readonly CartLine[], item: CartItem): { lines: CartLine[]; result: AddResult } {
  const limit = maxQuantity(item.stock);
  // Nothing in stock: cannot add (the API never lists such an offer, this is only a safety net).
  if (limit < 1) return { lines: [...lines], result: "max" };

  const existing = lines.find((line) => line.offerId === item.offerId);
  if (!existing) {
    return { lines: [...lines, { ...item, quantity: 1 }], result: "added" };
  }
  if (existing.quantity >= limit) {
    // Already at the limit. If the stock went down meanwhile, the quantity is lowered to the new limit.
    return { lines: lines.map((line) => (line === existing ? { ...item, quantity: limit } : line)), result: "max" };
  }
  return {
    lines: lines.map((line) => (line === existing ? { ...item, quantity: existing.quantity + 1 } : line)),
    result: "increased",
  };
}

/** Sets the quantity of one line, kept inside 1 … min(stock, 5). Unknown offer or a non-number: no change. */
export function setQuantity(lines: readonly CartLine[], offerId: number, quantity: number): CartLine[] {
  if (!Number.isFinite(quantity)) return [...lines];
  return lines.map((line) => {
    if (line.offerId !== offerId) return line;
    const clamped = Math.min(Math.max(Math.trunc(quantity), 1), maxQuantity(line.stock));
    return { ...line, quantity: clamped };
  });
}

/** Removes the line of one offer. */
export function removeLine(lines: readonly CartLine[], offerId: number): CartLine[] {
  return lines.filter((line) => line.offerId !== offerId);
}

/** The header badge: number of pieces (two of one offer count as 2). */
export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Sum in integer cents (display only - checkout computes the real total on the server). */
export function cartTotalCents(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
}

// ---- checkout (Task 16b) ----

/**
 * The lines as the server wants them: offer, quantity and the price the user SAW (expectedPriceCents),
 * so the server can answer "the price changed" instead of silently charging another amount.
 * `skip` = offers to leave out (lines that are no longer available).
 */
export function checkoutItems(lines: readonly CartLine[], skip: ReadonlySet<number> = new Set()): CartLineInput[] {
  return lines
    .filter((line) => !skip.has(line.offerId))
    .map((line) => ({ offerId: line.offerId, quantity: line.quantity, expectedPriceCents: line.priceCents }));
}

/**
 * Writes the server's answer (quote, or the lines of a 409 "cart_changed") into the cart: the current price,
 * stock, quantity and display data of every line the server can still sell.
 * A line the server cannot sell (unavailable) is kept AS IT IS - the page shows it disabled and the user removes it.
 * (Writing quantity 0 into it would make the stored cart invalid, and parseCart would then drop the whole cart.)
 * Lines the answer does not mention are not touched.
 */
export function applyQuoteLines(lines: readonly CartLine[], quoteLines: readonly CheckoutLine[]): CartLine[] {
  const byOffer = new Map(quoteLines.map((q) => [q.offerId, q]));
  return lines.map((line) => {
    const q = byOffer.get(line.offerId);
    const limit = q ? maxQuantity(q.stock) : 0;
    if (!q || !q.available || q.quantity < 1 || limit < 1) return line;
    return {
      offerId: line.offerId,
      quantity: Math.min(q.quantity, limit),
      productSlug: q.productSlug,
      title: q.title,
      edition: q.edition,
      platformName: q.platformName,
      regionName: q.regionName,
      coverUrl: q.coverUrl,
      sellerName: q.sellerName,
      priceCents: q.unitPriceCents,
      stock: q.stock,
    };
  });
}

/**
 * After a successful payment: takes the bought quantities out of the cart. A line whose whole quantity was bought
 * disappears; if the user added more of it after the order was created, the extra pieces stay.
 */
export function removePurchased(
  lines: readonly CartLine[],
  bought: readonly { offerId: number; quantity: number }[],
): CartLine[] {
  const boughtQty = new Map<number, number>();
  for (const item of bought) boughtQty.set(item.offerId, (boughtQty.get(item.offerId) ?? 0) + item.quantity);
  return lines.flatMap((line) => {
    const left = line.quantity - (boughtQty.get(line.offerId) ?? 0);
    if (left === line.quantity) return [line];
    return left >= 1 ? [{ ...line, quantity: left }] : [];
  });
}

// ---- reading and writing the stored text ----

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isText = (v: unknown): v is string => typeof v === "string";

/** True when `value` is a complete, sensible cart line (types, integer cents, quantity within its limit). */
function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isInt(v.offerId) &&
    isInt(v.stock) &&
    isInt(v.quantity) &&
    v.quantity >= 1 &&
    v.quantity <= maxQuantity(v.stock) &&
    isInt(v.priceCents) &&
    v.priceCents >= 0 &&
    isText(v.productSlug) &&
    isText(v.title) &&
    isText(v.edition) &&
    isText(v.platformName) &&
    isText(v.regionName) &&
    isText(v.sellerName) &&
    (v.coverUrl === null || isText(v.coverUrl))
  );
}

/**
 * Turns the stored text back into lines. Anything wrong - no data, not JSON, not a list, one broken line,
 * the same offer twice - gives an EMPTY cart (owner rule C3: never crash on old or corrupt data).
 * Only the known fields are kept, so extra stored fields cannot sneak into the app.
 */
export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data) || !data.every(isCartLine)) return [];
  if (new Set(data.map((line) => line.offerId)).size !== data.length) return [];
  return data.map((line) => ({
    offerId: line.offerId,
    quantity: line.quantity,
    productSlug: line.productSlug,
    title: line.title,
    edition: line.edition,
    platformName: line.platformName,
    regionName: line.regionName,
    coverUrl: line.coverUrl,
    sellerName: line.sellerName,
    priceCents: line.priceCents,
    stock: line.stock,
  }));
}

export function serializeCart(lines: readonly CartLine[]): string {
  return JSON.stringify(lines);
}

// ---- building a CartItem from API data ----

/** The product page: one of its offers. */
export function itemFromOffer(detail: ProductDetail, offer: Offer): CartItem {
  return {
    offerId: offer.offerId,
    productSlug: detail.product.slug,
    title: detail.game.title,
    edition: detail.product.edition,
    platformName: detail.product.platform.name,
    regionName: detail.product.region.name,
    coverUrl: detail.game.coverUrl,
    sellerName: offer.seller.name,
    priceCents: offer.priceCents,
    stock: offer.stock,
  };
}

/** A Store card: its cheapest offer, or null when the product cannot be bought (no button then). */
export function itemFromListing(item: ProductItem): CartItem | null {
  if (!item.cheapestOffer || item.priceCents === null) return null;
  return {
    offerId: item.cheapestOffer.offerId,
    productSlug: item.slug,
    title: item.title,
    edition: item.edition,
    platformName: item.platform.name,
    regionName: item.region.name,
    coverUrl: item.coverUrl,
    sellerName: item.cheapestOffer.sellerName,
    priceCents: item.priceCents,
    stock: item.cheapestOffer.stock,
  };
}
