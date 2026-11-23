// What the cart page shows next to each line after the server checked it (quote or 409 "cart_changed").
// Pure functions: they take the previous statuses and the server's answer and return new statuses.
//
// Why the notices are kept HERE and not read from the latest answer: after an answer the cart is updated
// (new price, lower quantity), which is a new question to the server - and that second answer says "nothing
// changed". The user must still see "Price updated: €10.99 → €12.49", so a notice stays until the line is
// removed or the user changes that line themselves.
import type { CartLineInput, CheckoutLine } from "../../api/types.ts";
import { formatPrice } from "../../lib/formatPrice.ts";

export interface LineStatus {
  /** The server cannot sell this line now: shown disabled, left out of the total and of checkout. */
  unavailable: boolean;
  /** "Price updated: €x → €y" */
  priceNotice?: string;
  /** "Only N left – quantity reduced" */
  quantityNotice?: string;
}

/** offerId → status. Lines without an entry have no notice and are available. */
export type LineStatuses = Readonly<Record<number, LineStatus>>;

export function priceNoticeText(fromCents: number, toCents: number): string {
  return `Price updated: ${formatPrice(fromCents)} → ${formatPrice(toCents)}`;
}

export function quantityNoticeText(left: number): string {
  return `Only ${left} left – quantity reduced`;
}

export const UNAVAILABLE_TEXT = "No longer available";

/**
 * Merges one server answer into the statuses. `sent` = the lines exactly as they were sent (their expected price
 * is the "before" of the price notice). Availability always follows the newest answer; notices are added, never
 * removed here (see the comment at the top).
 */
export function mergeAnswer(prev: LineStatuses, sent: readonly CartLineInput[], answer: readonly CheckoutLine[]): LineStatuses {
  const next: Record<number, LineStatus> = { ...prev };
  for (const q of answer) {
    const status: LineStatus = { ...(prev[q.offerId] ?? { unavailable: false }) };
    status.unavailable = !q.available || q.quantity < 1 || q.changes.includes("unavailable");

    const before = sent.find((item) => item.offerId === q.offerId)?.expectedPriceCents;
    if (q.changes.includes("price_changed") && before !== undefined && before !== q.unitPriceCents) {
      status.priceNotice = priceNoticeText(before, q.unitPriceCents);
    }
    if (q.changes.includes("quantity_reduced") && !status.unavailable) {
      status.quantityNotice = quantityNoticeText(q.quantity);
    }
    next[q.offerId] = status;
  }
  return next;
}

/** The user changed this line (quantity) or removed it: its notices are answered, forget them. Availability stays. */
export function clearNotices(statuses: LineStatuses, offerId: number): LineStatuses {
  const status = statuses[offerId];
  if (!status) return statuses;
  return { ...statuses, [offerId]: { unavailable: status.unavailable } };
}

/** The offers the server said it cannot sell. */
export function unavailableOffers(statuses: LineStatuses): Set<number> {
  return new Set(
    Object.entries(statuses)
      .filter(([, status]) => status.unavailable)
      .map(([offerId]) => Number(offerId)),
  );
}

/** True when any line shows a notice or is unavailable (the page then shows one summary line above the list). */
export function hasNotices(statuses: LineStatuses, offerIds: readonly number[]): boolean {
  return offerIds.some((id) => {
    const s = statuses[id];
    return Boolean(s && (s.unavailable || s.priceNotice || s.quantityNotice));
  });
}
