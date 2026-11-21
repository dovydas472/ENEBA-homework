import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";

export function LoginPage() {
  useDocumentTitle("Sign in");
  return <PlaceholderPage title="Sign in" />;
}
