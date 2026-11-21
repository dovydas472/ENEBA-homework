import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";

export function RegisterPage() {
  useDocumentTitle("Create account");
  return <PlaceholderPage title="Create account" />;
}
