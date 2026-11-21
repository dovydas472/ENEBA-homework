import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";

// Task 12 builds the real page; it will read the `:slug` of the URL with useParams().
export function ProductPage() {
  useDocumentTitle("Product");
  return <PlaceholderPage title="Product" />;
}
