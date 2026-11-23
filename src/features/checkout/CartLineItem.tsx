import { CircleAlert, Trash2 } from "lucide-react";
import { PrefetchLink } from "../../components/PrefetchLink.tsx";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import { formatPrice } from "../../lib/formatPrice.ts";
import { maxQuantity, type CartLine } from "../cart/cart.ts";
import styles from "./CartLineItem.module.css";
import { UNAVAILABLE_TEXT, type LineStatus } from "./lineStatus.ts";
import { QuantityStepper } from "./QuantityStepper.tsx";

interface CartLineItemProps {
  line: CartLine;
  status: LineStatus | undefined;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}

/**
 * One cart line (Eneba's cart: cover, "Sold by", title, "− 1 +", price, trash icon).
 * The notices the server's last answer produced are shown under the title. An unavailable line is dimmed,
 * has no stepper and no price (it is not in the total), and can only be removed.
 */
export function CartLineItem({ line, status, onQuantity, onRemove }: CartLineItemProps) {
  const unavailable = status?.unavailable ?? false;
  const productLink = `/product/${line.productSlug}`;
  const notices = unavailable ? [] : [status?.priceNotice, status?.quantityNotice].filter((n): n is string => Boolean(n));

  return (
    <li className={styles.line} data-unavailable={unavailable || undefined}>
      {/* The cover repeats the title link: hidden from screen readers and the Tab order, so the title is the one link. */}
      <PrefetchLink to={productLink} className={styles.coverLink} tabIndex={-1} aria-hidden="true">
        {line.coverUrl ? (
          <img className={styles.cover} src={line.coverUrl} alt="" loading="lazy" />
        ) : (
          <span className={styles.cover} />
        )}
      </PrefetchLink>

      <div className={styles.body}>
        <p className={styles.seller}>Sold by {line.sellerName}</p>
        <h2 className={styles.title}>
          <PrefetchLink to={productLink}>{line.title}</PrefetchLink>
        </h2>
        {line.edition !== "Standard" && <p className={styles.meta}>{line.edition}</p>}
        <p className={styles.meta}>
          {line.platformName} · {line.regionName}
        </p>

        {unavailable && (
          <p className={styles.unavailable}>
            <CircleAlert className={styles.noticeIcon} aria-hidden="true" />
            {UNAVAILABLE_TEXT}
          </p>
        )}
        {notices.map((notice) => (
          <p key={notice} className={styles.notice}>
            <CircleAlert className={styles.noticeIcon} aria-hidden="true" />
            {notice}
          </p>
        ))}

        {!unavailable && (
          <div className={styles.bottom}>
            <QuantityStepper
              value={line.quantity}
              max={maxQuantity(line.stock)}
              onChange={onQuantity}
              label={`Quantity of ${line.title}`}
            />
            <div className={styles.price}>
              <VisuallyHidden>Line total </VisuallyHidden>
              <span className={styles.total}>{formatPrice(line.priceCents * line.quantity)}</span>
              {line.quantity > 1 && <span className={styles.each}>{formatPrice(line.priceCents)} each</span>}
            </div>
          </div>
        )}
      </div>

      <button type="button" className={styles.remove} aria-label={`Remove ${line.title} from the cart`} onClick={onRemove}>
        <Trash2 className={styles.removeIcon} aria-hidden="true" />
      </button>
    </li>
  );
}
