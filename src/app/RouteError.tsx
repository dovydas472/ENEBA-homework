import { useEffect } from "react";
import { useRouteError } from "react-router";
import { ErrorState } from "../components/ErrorState.tsx";

/**
 * Shown inside the layout when a page crashes while rendering (a bug in our code).
 * The real error goes to the browser console for the developer; the visitor only sees a generic message.
 */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState onRetry={() => window.location.reload()} />;
}
