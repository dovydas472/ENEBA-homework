// The cart store: ONE place outside React that holds the current cart lines, saves them to localStorage
// and tells the subscribed components when they change. React reads it with useSyncExternalStore
// (see useCart.ts), so the header badge, the product page and the cards all show the same cart.
//
// Why not a React context? The cart also changes from OUTSIDE React (another browser tab writes
// localStorage), and useSyncExternalStore is React's own tool for "a value that lives outside React":
// no provider to wrap the app in, and no re-render of components that do not read the cart.
import type { CheckoutLine } from "../../api/types.ts";
import {
  addItem,
  applyQuoteLines,
  CART_STORAGE_KEY,
  parseCart,
  removeLine,
  removePurchased,
  serializeCart,
  setQuantity,
  type AddResult,
  type CartItem,
  type CartLine,
} from "./cart.ts";

/** The two browser APIs the store uses; tests pass fakes. */
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type EventSource = Pick<Window, "addEventListener" | "removeEventListener">;

export interface CartStore {
  /** The current lines. The SAME array is returned until something changes (useSyncExternalStore needs that). */
  getSnapshot(): readonly CartLine[];
  /** Calls `listener` after every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  add(item: CartItem): AddResult;
  setQuantity(offerId: number, quantity: number): void;
  remove(offerId: number): void;
  clear(): void;
  /** Task 16b: the server's current price / stock / quantity for the lines it can still sell (see applyQuoteLines). */
  applyQuote(quoteLines: readonly CheckoutLine[]): void;
  /** Task 16b: after a successful payment, takes the bought pieces out of the cart. */
  removePurchased(bought: readonly { offerId: number; quantity: number }[]): void;
}

/**
 * Builds a store on top of `storage` (localStorage in the app; null = not available, e.g. blocked cookies:
 * the cart then works in memory for this page only). `events` is the window, for the `storage` event.
 */
export function createCartStore(storage: Storage | null, events: EventSource | null): CartStore {
  let lines: readonly CartLine[] | null = null; // null = not read yet (read on first use)
  const listeners = new Set<() => void>();

  function load(): readonly CartLine[] {
    try {
      return parseCart(storage?.getItem(CART_STORAGE_KEY) ?? null);
    } catch {
      return []; // reading can throw (storage disabled by the browser): start empty, never crash
    }
  }

  function current(): readonly CartLine[] {
    if (lines === null) lines = load();
    return lines;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  /** Every change goes through here: keep it, save it, tell the components. */
  function commit(next: readonly CartLine[]) {
    lines = next;
    try {
      storage?.setItem(CART_STORAGE_KEY, serializeCart(next));
    } catch {
      // Full or blocked storage: the cart still works for this page, it is just not remembered.
    }
    notify();
  }

  /**
   * Like commit, but only when the lines really differ. Applying a quote changes the cart, which asks for a new
   * quote; the second answer changes nothing, so it must not produce a new array (that would ask again, forever).
   */
  function commitIfChanged(next: readonly CartLine[]) {
    if (serializeCart(next) !== serializeCart(current())) commit(next);
  }

  // Tab sync (C4): the browser fires `storage` in the OTHER tabs of this site when one tab writes
  // localStorage (never in the tab that wrote). key === null means localStorage.clear().
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
    lines = load();
    notify();
  }

  return {
    getSnapshot: current,
    subscribe(listener) {
      if (listeners.size === 0) {
        events?.addEventListener("storage", onStorage);
        // Nobody listened until now, so another tab may have changed the cart meanwhile: re-read it
        // (and keep the old array when nothing changed, so React does not render again for nothing).
        const fresh = load();
        if (serializeCart(fresh) !== serializeCart(current())) lines = fresh;
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) events?.removeEventListener("storage", onStorage);
      };
    },
    add(item) {
      const { lines: next, result } = addItem(current(), item);
      commit(next);
      return result;
    },
    setQuantity(offerId, quantity) {
      commit(setQuantity(current(), offerId, quantity));
    },
    remove(offerId) {
      commit(removeLine(current(), offerId));
    },
    clear() {
      commit([]);
    },
    applyQuote(quoteLines) {
      commitIfChanged(applyQuoteLines(current(), quoteLines));
    },
    removePurchased(bought) {
      commitIfChanged(removePurchased(current(), bought));
    },
  };
}

/** localStorage, or null when the browser does not allow it (just touching it can throw). */
function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The app's one cart. */
export const cartStore = createCartStore(browserStorage(), typeof window === "undefined" ? null : window);
