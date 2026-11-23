import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { quoteCart } from "../../api/orders.ts";
import { queryKeys } from "../../api/queries.ts";
import { checkoutItems, type CartLine } from "../cart/cart.ts";
import { applyServerAnswer } from "./lineStatusStore.ts";

export interface CartQuote {
  /** A request is running (first check, or a re-check after a change). */
  isChecking: boolean;
  /** The last check failed (network / 5xx). The cart still works: checkout re-checks on the server anyway. */
  isError: boolean;
  retry: () => void;
}

/**
 * Asks the server for today's price, stock and availability of every cart line (POST /api/checkout/quote),
 * on load and whenever the cart changes, and writes the answer into the cart (applyServerAnswer).
 *
 * Why re-quote at all? The cart lives in localStorage and may be days old: the price, the stock or the offer
 * itself may have changed. Better to show "Price updated: €10.99 → €12.49" on the cart page than to surprise the
 * user at checkout. (The server checks again when the order is created - this is for the user, not for safety.)
 *
 * The query key is the exact list of lines sent: a changed cart is a new question. Applying an answer changes the
 * cart once (new price...), which asks once more; that answer changes nothing, and the cart store ignores
 * "changes" that change nothing, so it stops there. keepPreviousData: the page does not flash while re-checking.
 */
export function useCartQuote(lines: readonly CartLine[]): CartQuote {
  const items = useMemo(() => checkoutItems(lines), [lines]);
  const query = useQuery({
    queryKey: queryKeys.cartQuote(items),
    queryFn: async ({ signal }) => {
      const answer = await quoteCart(items, { signal });
      applyServerAnswer(items, answer.lines); // the one place where the answer reaches the cart
      return answer;
    },
    enabled: items.length > 0,
    staleTime: 0, // every visit to the cart checks again
    placeholderData: keepPreviousData,
  });
  return {
    isChecking: query.isFetching,
    isError: query.isError && !query.isFetching,
    retry: () => void query.refetch(),
  };
}
