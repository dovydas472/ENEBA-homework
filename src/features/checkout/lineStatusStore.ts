// The per-line statuses of the cart page (notices + "no longer available"), kept outside React like the cart
// itself (cartStore.ts) and the toast (lib/toast.ts): a value + listeners, read with useSyncExternalStore.
// Outside React because the answer that changes them arrives inside a query function / mutation callback,
// and because they should still be there when the user leaves the cart and comes back in this tab.
import { useSyncExternalStore } from "react";
import type { CheckoutItem, QuoteLine } from "../../api/types.ts";
import { cartStore } from "../cart/cartStore.ts";
import { clearNotices, mergeAnswer, type LineStatuses } from "./lineStatus.ts";

let statuses: LineStatuses = {};
const listeners = new Set<() => void>();

function set(next: LineStatuses) {
  statuses = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const lineStatusStore = {
  get: () => statuses,
  /** The user changed the quantity of this line: its notices are answered. */
  clearNotices(offerId: number) {
    set(clearNotices(statuses, offerId));
  },
  /** The line left the cart: forget everything about it. */
  forget(offerId: number) {
    if (!(offerId in statuses)) return;
    const { [offerId]: _removed, ...rest } = statuses; // eslint-disable-line @typescript-eslint/no-unused-vars -- the removed entry is dropped on purpose
    set(rest);
  },
  /** Tests only: start from nothing. */
  reset() {
    set({});
  },
};

/**
 * ONE place that handles every server answer about the cart (the quote, and the lines of a 409 "cart_changed"):
 *   1. the cart takes the current price / stock / quantity of the lines that can still be bought;
 *   2. the statuses remember what changed, so the page can say it.
 * `sent` = the lines exactly as they were sent (the price the user saw is the "before" of a price notice).
 */
export function applyServerAnswer(sent: readonly CheckoutItem[], answer: readonly QuoteLine[]) {
  set(mergeAnswer(statuses, sent, answer));
  cartStore.applyQuote(answer);
}

/** The current statuses; the component re-renders when they change. */
export function useLineStatuses(): LineStatuses {
  return useSyncExternalStore(subscribe, lineStatusStore.get);
}
