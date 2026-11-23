import { CartView } from "../features/checkout/CartView.tsx";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";

/** /cart (open to everyone; "Checkout" asks for sign-in). */
export function CartPage() {
  useDocumentTitle("Cart");
  return <CartView />;
}
