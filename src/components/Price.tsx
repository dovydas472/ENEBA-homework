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
  /** Small text above the price, e.g. "From" on a product card. */
  label?: string;
  /** card = product card, row = offer row (20px), large = buy box on the product page (28px). */
  size?: "card" | "row" | "large";
  className?: string;
}

/** A price block (DESIGN.md 4.4): an optional "From €29.99 -60%" line above the current price. */
export function Price({ cents, oldCents = null, discountPercent = null, label, size = "card", className }: PriceProps) {
  const showOld = oldCents !== null && cents !== null && oldCents > cents;

  return (
    <div className={cx(styles.price, styles[size], className)}>
      {/* First line, as on Eneba: "From €29.99 -60%" (label, old price, discount), then the price below. */}
      {(label || showOld) && (
        <div className={styles.was}>
          {label && <span className={styles.label}>{label}</span>}
          {showOld && (
            <s className={styles.old}>
              <VisuallyHidden>Original price </VisuallyHidden>
              {formatPrice(oldCents)}
            </s>
          )}
          {showOld && discountPercent !== null && discountPercent > 0 && (
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
