import { cx } from "../lib/cx.ts";
import { formatPrice } from "../lib/formatPrice.ts";
import styles from "./Price.module.css";
import { VisuallyHidden } from "./VisuallyHidden.tsx";

interface PriceProps {
  /** Current price in integer cents; null = unknown / out of stock (shows "—"). */
  cents: number | null;
  /** Price before the discount, in cents. Shown struck through, only when it is higher than `cents`. */
  oldCents?: number | null;
  /** Whole percent as sent by the API (it is not recomputed here). Shown next to the old price. */
  discountPercent?: number | null;
  /** card = product card / offer row, large = buy box on the product page. */
  size?: "card" | "large";
  className?: string;
}

/** A price block (DESIGN.md 4.4): optional "old price -66%" line above the current price. */
export function Price({ cents, oldCents = null, discountPercent = null, size = "card", className }: PriceProps) {
  const showOld = oldCents !== null && cents !== null && oldCents > cents;

  return (
    <div className={cx(styles.price, styles[size], className)}>
      {showOld && (
        <div className={styles.was}>
          <s className={styles.old}>
            <VisuallyHidden>Original price </VisuallyHidden>
            {formatPrice(oldCents)}
          </s>
          {discountPercent !== null && discountPercent > 0 && (
            <span className={styles.discount}>
              <VisuallyHidden>Discount </VisuallyHidden>-{discountPercent}%
            </span>
          )}
        </div>
      )}
      <div className={styles.current}>{formatPrice(cents)}</div>
    </div>
  );
}
