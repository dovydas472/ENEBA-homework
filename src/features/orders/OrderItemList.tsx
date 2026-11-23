import type { ReactNode } from "react";
import { Link } from "react-router";
import type { OrderItem } from "../../api/types.ts";
import { formatPrice } from "../../lib/formatPrice.ts";
import layout from "../checkout/CheckoutLayout.module.css";
import styles from "./OrderItemList.module.css";

interface OrderItemListProps {
  items: readonly OrderItem[];
  /** Extra content under one item (the keys of a paid order). */
  renderExtra?: (item: OrderItem) => ReactNode;
}

/**
 * The items of an order, from the SNAPSHOT the server stored when the order was created (title, seller, price...):
 * a later price change or a renamed product does not change what this order says. Used by the payment page and the order page.
 */
export function OrderItemList({ items, renderExtra }: OrderItemListProps) {
  return (
    <ul className={layout.lines}>
      {items.map((item) => (
        <li key={item.offerId} className={styles.item}>
          <div className={styles.head}>
            <div className={styles.info}>
              <p className={styles.seller}>Sold by {item.sellerName}</p>
              <h2 className={styles.title}>
                <Link to={`/product/${item.productSlug}`}>{item.title}</Link>
              </h2>
              {item.edition !== "Standard" && <p className={styles.meta}>{item.edition}</p>}
              <p className={styles.meta}>
                {item.platformName} · {item.regionName}
              </p>
            </div>
            <p className={styles.price}>
              <span className={styles.each}>
                {item.quantity} × {formatPrice(item.unitPriceCents)}
              </span>
              <span className={styles.total}>{formatPrice(item.unitPriceCents * item.quantity)}</span>
            </p>
          </div>
          {renderExtra?.(item)}
        </li>
      ))}
    </ul>
  );
}
