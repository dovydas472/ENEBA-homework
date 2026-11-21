import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";

export function CartPage() {
  useDocumentTitle("Cart");
  return <PlaceholderPage title="Cart" />;
}
