import { cartCount } from "../features/cart/cart.ts";
import { useCartLines } from "../features/cart/useCart.ts";

/**
 * Number of items in the cart (pieces, so 2 × one offer = 2), shown as the badge in the header.
 * Task 12 replaced the stub; the name and the return type stayed, so the header did not change.
 */
export function useCartCount(): number {
  return cartCount(useCartLines());
}
