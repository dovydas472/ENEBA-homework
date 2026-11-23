import { Navigate, Outlet, useLocation } from "react-router";
import { ErrorState } from "../../components/ErrorState.tsx";
import { Spinner } from "../../components/Spinner.tsx";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import { authPageLink } from "../../lib/safeNext.ts";
import styles from "./RequireAuth.module.css";
import { useCurrentUser } from "./useCurrentUser.ts";

/**
 * A layout route that protects every page nested inside it (routes.ts): /orders, /orders/:id and /checkout/:orderId.
 *   - signed in   -> the page (<Outlet />)
 *   - signed out  -> /login?next=<this page>, so the user comes back here after signing in
 *   - still asking the server -> a spinner (never a flash of the sign-in page for a signed-in user)
 *   - the server could not be asked -> an error with Retry ("we do not know" is not "signed out")
 * This only decides what the browser SHOWS. The real protection is on the server: every protected
 * endpoint answers 401 without a valid session (requireUser in pkg/server).
 */
export function RequireAuth() {
  const { user, isPending, isError, refetch } = useCurrentUser();
  const location = useLocation();

  if (user) return <Outlet />;
  if (isPending) {
    return (
      <div className={styles.checking}>
        <Spinner />
        <VisuallyHidden>Checking your sign-in…</VisuallyHidden>
      </div>
    );
  }
  if (isError) return <ErrorState message="Could not check whether you are signed in." onRetry={refetch} />;
  // replace: Back from the sign-in page must not return to this redirect (it would bounce again).
  return <Navigate to={authPageLink("/login", location.pathname + location.search)} replace />;
}
