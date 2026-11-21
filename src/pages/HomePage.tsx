import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";

// Home is the only page without a name in the tab title: "EneHomeworkBa – internship demo".
export function HomePage() {
  useDocumentTitle();
  return <PlaceholderPage title="Home" />;
}
