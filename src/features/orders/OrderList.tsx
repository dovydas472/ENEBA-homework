import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import type { OrderSummary } from "../../api/types.ts";
import { ButtonLink } from "../../components/Button.tsx";
import { EmptyState } from "../../components/EmptyState.tsx";
import { formatDateTime } from "../../lib/formatDate.ts";
import { formatPrice } from "../../lib/formatPrice.ts";
import layout from "../checkout/CheckoutLayout.module.css";
import styles from "./OrderList.module.css";
import { itemCountText, shortOrderId } from "./orderText.ts";
import { StatusBadge } from "./StatusBadge.tsx";

/**
 * The signed-in user's orders, newest first (the server's order). Each row is ONE link: a pending order goes to its
 * payment page ("Complete payment"), every other order to its page.
 */
export function OrderList({ orders }: { orders: readonly OrderSummary[] }) {
  if (orders.length === 0) {
    return (
      <EmptyState as="h1" title="No orders yet" message="Games you buy will appear here, with their keys.">
        <ButtonLink to="/store">Browse the store</ButtonLink>
      </EmptyState>
    );
  }
  return (
    <section className={styles.panel} aria-labelledby="orders-title">
      <h1 id="orders-title" className={layout.panelTitle}>
        My orders
      </h1>
      <ul className={layout.lines}>
        {orders.map((order) => {
          const pending = order.status === "pending";
          return (
            <li key={order.id}>
              <Link to={pending ? `/checkout/${order.id}` : `/orders/${order.id}`} className={styles.row}>
                <span className={styles.main}>
                  <span className={styles.title}>Order {shortOrderId(order.id)}</span>
                  <span className={styles.meta}>
                    {formatDateTime(order.createdAt)} · {itemCountText(order.itemCount)}
                  </span>
                </span>
                <StatusBadge status={order.status} />
                <span className={styles.total}>{formatPrice(order.totalCents)}</span>
                <span className={styles.go}>
                  {pending ? "Complete payment" : "View"}
                  <ChevronRight className={styles.chevron} aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
