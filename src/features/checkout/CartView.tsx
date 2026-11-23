import { useRef } from "react";
import { Link } from "react-router";
import { Button, ButtonLink } from "../../components/Button.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import { formatPrice } from "../../lib/formatPrice.ts";
import { useCurrentUser } from "../auth/useCurrentUser.ts";
import { cartCount, cartTotalCents } from "../cart/cart.ts";
import { cartStore } from "../cart/cartStore.ts";
import { useCartLines } from "../cart/useCart.ts";
import { CartLineItem } from "./CartLineItem.tsx";
import layout from "./CheckoutLayout.module.css";
import { hasNotices, unavailableOffers } from "./lineStatus.ts";
import { lineStatusStore, useLineStatuses } from "./lineStatusStore.ts";
import { useCartQuote } from "./useCartQuote.ts";
import { useCheckout } from "./useCheckout.ts";

/**
 * The cart page (/cart): the lines with their server notices on the left, the Summary with "Checkout" on the right
 * (Eneba's cart layout). The total counts only the lines the server can still sell.
 */
export function CartView() {
  const lines = useCartLines();
  const statuses = useLineStatuses();
  const quote = useCartQuote(lines);
  const checkout = useCheckout(lines, statuses);
  const { user } = useCurrentUser();
  const titleRef = useRef<HTMLHeadingElement>(null);

  if (lines.length === 0) {
    return (
      <EmptyState as="h1" title="Your cart is empty" message="Find a game you like and add it to your cart.">
        <ButtonLink to="/store">Browse the store</ButtonLink>
      </EmptyState>
    );
  }

  const unavailable = unavailableOffers(statuses);
  const payable = lines.filter((line) => !unavailable.has(line.offerId));
  const count = cartCount(payable);
  const changed = hasNotices(
    statuses,
    lines.map((line) => line.offerId),
  );

  function remove(offerId: number) {
    cartStore.remove(offerId);
    lineStatusStore.forget(offerId);
    titleRef.current?.focus(); // the button the user pressed is gone: keep the keyboard focus on the cart
  }

  return (
    <div className={layout.page}>
      <section className={layout.panel} aria-labelledby="cart-title">
        <h1 id="cart-title" className={layout.panelTitle} ref={titleRef} tabIndex={-1}>
          My cart
        </h1>
        {/* Always rendered: screen readers announce text that appears inside an existing live region. */}
        <p className={layout.changed} role="status">
          {changed ? "Some items changed since you added them. Check the notes below." : ""}
        </p>
        {quote.isError && (
          <p className={layout.error} role="alert">
            Could not check the latest prices and stock.{" "}
            <Button variant="ghost" onClick={quote.retry}>
              Try again
            </Button>
          </p>
        )}
        <ul className={layout.lines} aria-busy={quote.isChecking || undefined}>
          {lines.map((line) => (
            <CartLineItem
              key={line.offerId}
              line={line}
              status={statuses[line.offerId]}
              onQuantity={(quantity) => {
                cartStore.setQuantity(line.offerId, quantity);
                lineStatusStore.clearNotices(line.offerId);
              }}
              onRemove={() => remove(line.offerId)}
            />
          ))}
        </ul>
      </section>

      <section className={layout.side} aria-labelledby="summary-title">
        <h2 id="summary-title" className={layout.panelTitle}>
          Summary
        </h2>
        <Button
          className={layout.fullWidth}
          loading={checkout.isPending}
          disabled={payable.length === 0}
          onClick={checkout.checkout}
        >
          Checkout
        </Button>
        {user === null && <p className={layout.note}>You will be asked to sign in first. Your cart stays here.</p>}
        {checkout.errorMessage && (
          <p className={layout.error} role="alert">
            {checkout.errorMessage}
          </p>
        )}
        {/* 16a rule R10: at most 3 unpaid orders. The way out is on the orders page: pay or cancel one. */}
        {checkout.tooManyUnpaidMessage && (
          <p className={layout.error} role="alert">
            {checkout.tooManyUnpaidMessage}.{" "}
            <Link to="/orders" className={layout.errorLink}>
              View your orders
            </Link>
          </p>
        )}
        <p className={layout.row}>
          <span>
            {count} {count === 1 ? "product" : "products"}
          </span>
          <span className={layout.rowValue}>{formatPrice(cartTotalCents(payable))}</span>
        </p>
        <p className={layout.total}>
          Total: <span className={layout.totalValue}>{formatPrice(cartTotalCents(payable))}</span>
        </p>
      </section>
    </div>
  );
}
