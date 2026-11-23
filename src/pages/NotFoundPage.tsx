import { ButtonLink } from "../components/Button.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";

/** The catch-all route (path "*"): any URL that no other route matches. It still renders inside the layout. */
export function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <EmptyState as="h1" title="Page not found" message="The page you are looking for does not exist or has moved.">
      {/* Task 17 parity: an outlined button, like Eneba's "Continue browsing" on its 404 (and our error page's "Home"). */}
      <ButtonLink to="/" variant="secondary">
        Back to the home page
      </ButtonLink>
    </EmptyState>
  );
}
