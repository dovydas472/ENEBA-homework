import { showToast } from "../../lib/toast.ts";
import type { CartItem } from "./cart.ts";
import { cartStore } from "./cartStore.ts";

/**
 * What every "Add to cart" button calls: add one piece and say what happened (C4).
 * The header badge updates by itself (it reads the same store).
 */
export function addToCart(item: CartItem) {
  const result = cartStore.add(item);
  const viewCart = { label: "View cart", to: "/cart" };
  if (result === "max") {
    showToast({ kind: "info", message: "Maximum quantity reached", action: viewCart });
  } else {
    showToast({ kind: "success", message: "Added to cart", action: viewCart });
  }
}
