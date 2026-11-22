import { useSyncExternalStore } from "react";
import type { CartLine } from "./cart.ts";
import { cartStore } from "./cartStore.ts";

/**
 * The current cart lines. The component re-renders when the cart changes - in this tab or in another one.
 * useSyncExternalStore(subscribe, getSnapshot): React calls getSnapshot on every render and re-renders
 * when the store calls back (subscribe) and the snapshot is a different array.
 */
export function useCartLines(): readonly CartLine[] {
  return useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot);
}
