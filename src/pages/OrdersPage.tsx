import { displayName } from "../api/auth.ts";
import { useCurrentUser } from "../features/auth/useCurrentUser.ts";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { PlaceholderPage } from "./PlaceholderPage.tsx";

/** /orders: still a placeholder (orders come with checkout), but already protected by RequireAuth (Task 14). */
export function OrdersPage() {
  useDocumentTitle("Orders");
  const { user } = useCurrentUser(); // RequireAuth renders this page only for a signed-in user
  return (
    <PlaceholderPage title="Orders">
      {user && (
        <p>
          Signed in as <strong>{displayName(user)}</strong>
        </p>
      )}
    </PlaceholderPage>
  );
}
