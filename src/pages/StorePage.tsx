import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";

// Task 11 builds the real page on top of useStoreParams (src/lib/useStoreParams.ts).
export function StorePage() {
  useDocumentTitle("Store");
  return <PlaceholderPage title="Store" />;
}
