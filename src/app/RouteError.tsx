import { useEffect } from "react";
import { useRouteError } from "react-router";
import { ButtonLink } from "../components/Button.tsx";
import { ErrorState } from "../components/ErrorState.tsx";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";

/**
 * The route-level error page (React Router `ErrorBoundary`, routes.ts): shown INSIDE the layout when a page crashes
 * while rendering (a bug in our code, or a page chunk that could not be downloaded). The header, the footer and the
 * "Waking up the server…" notice stay; only the page area is replaced, so the app never goes blank.
 *  - Retry reloads the page: a fresh start fixes a failed chunk download (e.g. after a new deploy) or a one-off glitch.
 *  - Home goes to the home page; React Router clears the error as soon as the URL changes.
 * The real error goes to the browser console for the developer; the visitor only sees a generic message.
 */
export function RouteError() {
  const error = useRouteError();
  useDocumentTitle("Something went wrong");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState as="h1" message="This page could not be shown. Please try again." onRetry={() => window.location.reload()}>
      <ButtonLink to="/" variant="secondary">
        Home
      </ButtonLink>
    </ErrorState>
  );
}
