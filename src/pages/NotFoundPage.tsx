import { PrefetchLink } from "../components/PrefetchLink.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";

/** The catch-all route (path "*"): any URL that no other route matches. It still renders inside the layout. */
export function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <EmptyState as="h1" title="Page not found" message="The page you are looking for does not exist or has moved.">
      <PrefetchLink to="/">Back to the home page</PrefetchLink>
    </EmptyState>
  );
}
