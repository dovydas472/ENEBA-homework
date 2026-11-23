// The client side of idempotency (Task 16a K4): one "checkout attempt" = one idempotencyKey.
//
// The server promises: the same key from the same user returns the SAME order (no second order, no second
// reservation). So the browser must send the same key again when it repeats the same attempt - a double click,
// or "Checkout" pressed again after a network error (the first request may have created the order even though
// the answer never arrived). It must send a NEW key when the cart is different, because that is a new order.
//
// So the key is stored together with a fingerprint of the cart it belongs to:
//   same cart  -> same key;   cart changed -> new key;   order created -> key forgotten.
// sessionStorage (not localStorage): it survives a page reload but belongs to this one tab, and is gone when the tab closes.
import { newIdempotencyKey } from "../../api/orders.ts";
import type { CartLineInput } from "../../api/types.ts";

export const ATTEMPT_STORAGE_KEY = "checkout-attempt:v1";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

interface StoredAttempt {
  key: string;
  cart: string;
}

/** The same cart always gives the same text (order of the lines does not matter). */
export function cartFingerprint(items: readonly CartLineInput[]): string {
  return JSON.stringify(
    [...items]
      .sort((a, b) => a.offerId - b.offerId)
      .map((item) => [item.offerId, item.quantity, item.expectedPriceCents]),
  );
}

export interface AttemptStore {
  /** The key for checking out exactly these items: the stored one if the cart is the same, otherwise a new one. */
  keyFor(items: readonly CartLineInput[]): string;
  /** The order was created (or the cart changed on the server's side): the next checkout is a new attempt. */
  clear(): void;
}

/**
 * `storage` = sessionStorage (null when the browser blocks it: the key then lives in memory, which still covers
 * double clicks and retries on this page). `newKey` makes a UUID; tests pass a predictable one.
 */
export function createAttemptStore(storage: Storage | null, newKey: () => string): AttemptStore {
  let memory: StoredAttempt | null = null;

  function read(): StoredAttempt | null {
    try {
      const raw = storage?.getItem(ATTEMPT_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Partial<StoredAttempt>;
        if (typeof data.key === "string" && typeof data.cart === "string") return { key: data.key, cart: data.cart };
      }
    } catch {
      // unreadable or blocked storage: fall back to memory
    }
    return memory;
  }

  function write(attempt: StoredAttempt | null) {
    memory = attempt;
    try {
      if (attempt) storage?.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
      else storage?.removeItem(ATTEMPT_STORAGE_KEY);
    } catch {
      // full or blocked storage: memory still has it
    }
  }

  return {
    keyFor(items) {
      const cart = cartFingerprint(items);
      const stored = read();
      if (stored && stored.cart === cart) return stored.key;
      const attempt = { key: newKey(), cart };
      write(attempt);
      return attempt.key;
    },
    clear() {
      write(null);
    },
  };
}

function browserSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The app's one attempt store. newIdempotencyKey (16a) = crypto.randomUUID(), a random v4 UUID built into the browser. */
export const checkoutAttempt = createAttemptStore(browserSessionStorage(), newIdempotencyKey);
