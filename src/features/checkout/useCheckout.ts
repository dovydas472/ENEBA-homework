import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { cartChangedLines, createOrder, isHttpStatus, orderErrorMessage } from "../../api/orders.ts";
import { queryKeys } from "../../api/queries.ts";
import type { CheckoutItem } from "../../api/types.ts";
import { authPageLink } from "../../lib/safeNext.ts";
import { useCurrentUser } from "../auth/useCurrentUser.ts";
import { checkoutItems, type CartLine } from "../cart/cart.ts";
import { checkoutAttempt } from "./attemptKey.ts";
import { unavailableOffers, type LineStatuses } from "./lineStatus.ts";
import { applyServerAnswer } from "./lineStatusStore.ts";

/** Where a signed-out user goes: the sign-in page, which sends them back to the cart afterwards. */
export const SIGN_IN_FOR_CHECKOUT = authPageLink("/login", "/cart");

interface Attempt {
  key: string;
  items: CheckoutItem[];
}

export interface Checkout {
  /** What the "Checkout" button calls. */
  checkout: () => void;
  isPending: boolean;
  /** A message for a failed attempt (network, 5xx, validation); null when there is none to show. */
  errorMessage: string | null;
}

/**
 * "Checkout" on the cart page: creates the pending order (POST /api/orders) and opens its payment page.
 *   - signed out          -> /login?next=/cart (the cart stays in localStorage)
 *   - 201 / 200           -> /checkout/:orderId  (200 = the server already had an order for this key)
 *   - 409 cart_changed    -> no order; the returned lines go into the cart with their notices; the user checks and presses again
 *   - 401 (session ended) -> treated as signed out
 * Unavailable lines are left out. The idempotency key (attemptKey.ts) makes a double click or a retry safe.
 */
export function useCheckout(lines: readonly CartLine[], statuses: LineStatuses): Checkout {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  const mutation = useMutation({
    mutationFn: ({ key, items }: Attempt) => createOrder(key, items),
    onSuccess: (order) => {
      checkoutAttempt.clear(); // the order exists: the next checkout is a new attempt
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      navigate(`/checkout/${order.id}`);
    },
    onError: (err, attempt) => {
      const changed = cartChangedLines(err);
      if (changed) {
        checkoutAttempt.clear(); // the cart changes now, so the next press is a new attempt anyway
        applyServerAnswer(attempt.items, changed);
        return;
      }
      if (isHttpStatus(err, 401)) {
        queryClient.setQueryData(queryKeys.currentUser, null);
        navigate(SIGN_IN_FOR_CHECKOUT);
      }
      // anything else: the key stays, so pressing Checkout again repeats the SAME attempt
    },
  });

  function checkout() {
    if (mutation.isPending) return; // a second click while the first request runs does nothing
    if (user === null) {
      navigate(SIGN_IN_FOR_CHECKOUT);
      return;
    }
    const items = checkoutItems(lines, unavailableOffers(statuses));
    if (items.length === 0) return;
    mutation.mutate({ key: checkoutAttempt.keyFor(items), items });
  }

  const err = mutation.error;
  const showError = err !== null && !cartChangedLines(err) && !isHttpStatus(err, 401);
  return {
    checkout,
    isPending: mutation.isPending,
    errorMessage: showError ? orderErrorMessage(err) : null,
  };
}
