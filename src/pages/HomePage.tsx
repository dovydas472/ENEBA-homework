import { ButtonLink } from "../components/Button.tsx";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";

// Home is the only page without a name in the tab title: "EneHomeworkBa – internship demo".
// Until the real home page exists, it sends visitors to the Store (owner request, Task 11b).
export function HomePage() {
  useDocumentTitle();
  return (
    <PlaceholderPage title="Home">
      <ButtonLink to="/store">Browse the store</ButtonLink>
    </PlaceholderPage>
  );
}
