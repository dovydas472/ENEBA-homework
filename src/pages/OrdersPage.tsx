import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";

export function OrdersPage() {
  useDocumentTitle("Orders");
  return <PlaceholderPage title="Orders" />;
}
