import type { Order } from "../../api/types.ts";
import { ButtonLink } from "../../components/Button.tsx";
import { formatDateTime } from "../../lib/formatDate.ts";
import { formatPrice } from "../../lib/formatPrice.ts";
import layout from "../checkout/CheckoutLayout.module.css";
import { KeyList } from "./KeyList.tsx";
import { OrderItemList } from "./OrderItemList.tsx";
import { shortOrderId } from "./orderText.ts";
import styles from "./OrderView.module.css";
import { StatusBadge } from "./StatusBadge.tsx";

/**
 * One order (/orders/:id): its items (snapshot), and per status:
 *   paid     -> every key, masked, with Reveal and Copy
 *   pending  -> "Complete payment" (the payment page)
 *   expired / cancelled -> a sentence why there are no keys
 */
export function OrderView({ order }: { order: Order }) {
  return (
    <div className={layout.page}>
      <section className={layout.panel} aria-labelledby="order-title">
        <div className={styles.heading}>
          <h1 id="order-title" className={layout.panelTitle}>
            Order {shortOrderId(order.id)}
          </h1>
          <StatusBadge status={order.status} />
        </div>
        <OrderItemList
          items={order.items}
          renderExtra={(item) =>
            order.status === "paid" && item.keys && item.keys.length > 0 ? <KeyList keys={item.keys} title={item.title} /> : null
          }
        />
      </section>

      <section className={layout.side} aria-labelledby="order-summary-title">
        <h2 id="order-summary-title" className={layout.panelTitle}>
          Summary
        </h2>
        <dl className={styles.facts}>
          <dt>Ordered</dt>
          <dd>{formatDateTime(order.createdAt)}</dd>
          {order.paidAt && (
            <>
              <dt>Paid</dt>
              <dd>{formatDateTime(order.paidAt)}</dd>
            </>
          )}
        </dl>
        <p className={layout.total}>
          Total: <span className={layout.totalValue}>{formatPrice(order.totalCents)}</span>
        </p>
        {order.status === "pending" && (
          <ButtonLink to={`/checkout/${order.id}`} className={layout.fullWidth}>
            Complete payment
          </ButtonLink>
        )}
        {order.status === "paid" && (
          <p className={layout.note}>Keys are hidden on screen until you press Reveal. Copy works without revealing.</p>
        )}
        {order.status === "expired" && (
          <p className={layout.note}>The 15-minute reservation ended before payment. No money was taken and the keys were released.</p>
        )}
        {order.status === "cancelled" && <p className={layout.note}>This order was cancelled. No money was taken.</p>}
        <ButtonLink to="/orders" variant="secondary" className={layout.fullWidth}>
          All orders
        </ButtonLink>
      </section>
    </div>
  );
}
