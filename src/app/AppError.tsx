import { useEffect } from "react";
import { useRouteError } from "react-router";
import { ButtonLink } from "../components/Button.tsx";
import { ErrorState } from "../components/ErrorState.tsx";
import { APP_NAME } from "../lib/appInfo.ts";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import styles from "./AppError.module.css";

/**
 * The app-level error page (the root route's `ErrorBoundary`, routes.ts). It is only reached when the FRAME itself
 * (header, footer, layout) crashes - a page crash is caught earlier by RouteError, inside the layout. Because the
 * frame is broken, this page draws its own minimal one, and "Home" reloads the whole document (`reloadDocument`)
 * instead of navigating inside the app that just failed.
 */
export function AppError() {
  const error = useRouteError();
  useDocumentTitle("Something went wrong");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.page}>
      <p className={styles.wordmark}>{APP_NAME}</p>
      <ErrorState as="h1" message="The app could not be shown. Please try again." onRetry={() => window.location.reload()}>
        <ButtonLink to="/" variant="secondary" reloadDocument>
          Home
        </ButtonLink>
      </ErrorState>
    </main>
  );
}
