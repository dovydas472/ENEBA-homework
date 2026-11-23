import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import {
  cancelOrder,
  isHttpStatus,
  isReservationExpired,
  orderErrorMessage,
  payOrder,
  type PaymentOutcome,
} from "../../api/orders.ts";
import { queryKeys } from "../../api/queries.ts";
import type { OrderDetailResponse } from "../../api/types.ts";
import { Button, ButtonLink } from "../../components/Button.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import { formatPrice } from "../../lib/formatPrice.ts";
import { showToast } from "../../lib/toast.ts";
import { useNow } from "../../lib/useNow.ts";
import { cartStore } from "../cart/cartStore.ts";
import { OrderItemList } from "../orders/OrderItemList.tsx";
import layout from "./CheckoutLayout.module.css";
import { clockOffsetMs, formatCountdown, remainingMs } from "./countdown.ts";
import styles from "./PaymentView.module.css";

interface PaymentViewProps {
  data: OrderDetailResponse;
  /** When the answer arrived (Date.now() of the browser): with serverTime it gives the clock difference. */
  receivedAt: number;
  /** Asks the server for the order again (after "not payable": its status changed). */
  reload: () => void;
}

/** The text of a declined payment. No money moves in this demo, and the order stays pending, so the user may try again. */
const DECLINED_TEXT = "Payment declined (simulated). No money was taken – you can try again.";

/**
 * The payment page of a pending order (/checkout/:orderId): the order summary, "Reserved for mm:ss", and a SIMULATED
 * payment - the user only picks what the "bank" answers. There are NO card number / CVC / expiry fields anywhere:
 * a demo site that asks for card details teaches people to type them into any site that looks like a shop.
 */
export function PaymentView({ data, receivedAt, reload }: PaymentViewProps) {
  const { order, serverTime } = data;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const now = useNow(1000);
  const radioName = useId();
  const [outcome, setOutcome] = useState<PaymentOutcome>("success");
  const [expiredByServer, setExpiredByServer] = useState(false);

  const pay = useMutation({
    mutationFn: (choice: PaymentOutcome) => payOrder(order.id, choice),
    onSuccess: (paid) => {
      cartStore.removePurchased(paid.items); // bought = no longer in the cart
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      showToast({ kind: "success", message: "Payment successful – your keys are ready" });
      navigate(`/orders/${paid.id}`, { replace: true }); // Back must not return to a paid order's payment page
    },
    onError: (err) => {
      if (isReservationExpired(err)) setExpiredByServer(true);
      else if (isHttpStatus(err, 409)) reload(); // "not payable": paid or cancelled meanwhile (another tab) - show what it is now
    },
  });

  const cancel = useMutation({
    mutationFn: () => cancelOrder(order.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      showToast({ kind: "info", message: "Order cancelled. Your cart is still here." });
      navigate("/cart");
    },
    onError: (err) => {
      if (isHttpStatus(err, 409)) reload();
    },
  });

  if (order.status === "paid") return <Navigate to={`/orders/${order.id}`} replace />;

  const left = remainingMs(order.reservedUntil, clockOffsetMs(serverTime, receivedAt), Math.max(now, receivedAt));

  if (order.status === "cancelled") {
    return (
      <EmptyState as="h1" title="This order was cancelled" message="Its keys were released. Your cart is still here.">
        <ButtonLink to="/cart">Back to cart</ButtonLink>
      </EmptyState>
    );
  }
  if (order.status === "expired" || expiredByServer || left === 0) {
    return (
      <EmptyState
        as="h1"
        title="Your reservation has expired"
        message="The keys were released after 15 minutes. Your cart is still here – check out again to get a new reservation."
      >
        <ButtonLink to="/cart">Back to cart</ButtonLink>
      </EmptyState>
    );
  }

  const busy = pay.isPending || cancel.isPending;
  const payError = pay.error ? (isHttpStatus(pay.error, 402) ? DECLINED_TEXT : orderErrorMessage(pay.error)) : null;

  function submit() {
    if (busy) return; // a second click while the request runs does nothing (and paying twice is safe on the server anyway)
    pay.mutate(outcome);
  }

  return (
    <div className={layout.page}>
      <section className={layout.panel} aria-labelledby="order-title">
        <h1 id="order-title" className={layout.panelTitle}>
          Your order
        </h1>
        <OrderItemList items={order.items} />
      </section>

      <section className={layout.side} aria-labelledby="payment-title">
        <h2 id="payment-title" className={layout.panelTitle}>
          Payment
        </h2>
        <p className={styles.countdown}>
          Reserved for{" "}
          <span role="timer" className={styles.time}>
            {formatCountdown(left)}
          </span>
        </p>
        <p className={layout.note}>Your keys are held for you until the time runs out.</p>

        <fieldset className={styles.simulated}>
          <legend className={styles.legend}>Simulated payment – no real money, no card details</legend>
          <p className={layout.note}>This is a demo shop. Choose how the payment should end:</p>
          <div className={styles.radios}>
            {(["success", "decline"] as const).map((value) => (
              <label key={value} className={styles.radioRow}>
                <input
                  type="radio"
                  className={styles.radio}
                  name={radioName}
                  value={value}
                  checked={outcome === value}
                  onChange={() => setOutcome(value)}
                />
                {value === "success" ? "Success" : "Decline"}
              </label>
            ))}
          </div>
        </fieldset>

        <Button className={layout.fullWidth} loading={pay.isPending} disabled={cancel.isPending} onClick={submit}>
          Pay {formatPrice(order.totalCents)}
        </Button>
        {payError && (
          <p className={layout.error} role="alert">
            {payError}
          </p>
        )}
        {cancel.error && !isHttpStatus(cancel.error, 409) && (
          <p className={layout.error} role="alert">
            {orderErrorMessage(cancel.error)}
          </p>
        )}

        <p className={layout.total}>
          Total: <span className={layout.totalValue}>{formatPrice(order.totalCents)}</span>
        </p>
        <Button
          variant="secondary"
          className={layout.fullWidth}
          loading={cancel.isPending}
          disabled={pay.isPending}
          onClick={() => !busy && cancel.mutate()}
        >
          Cancel order
        </Button>
      </section>
    </div>
  );
}
