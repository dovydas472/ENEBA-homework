import { ShoppingCart } from "lucide-react";
import type { ProductDetail } from "../../api/types.ts";
import { Button } from "../../components/Button.tsx";
import { cx } from "../../lib/cx.ts";
import { formatPrice } from "../../lib/formatPrice.ts";
import { addToCart } from "../cart/addToCart.ts";
import { itemFromOffer } from "../cart/cart.ts";
import styles from "./StickyBuyBar.module.css";

/**
 * Phones only (P5, CSS hides it above 600px): a bar fixed to the bottom of the screen with the best price and
 * "Add to cart". Eneba has no such bar (checked at 390px in Task 12), so its look is built from our tokens.
 * It shows only while the buy box is scrolled away (`hidden`), so the two buttons are never on screen together.
 * data-bottom-bar tells the layout to lift the toast above the bar.
 */
export function StickyBuyBar({ detail, hidden }: { detail: ProductDetail; hidden: boolean }) {
  const offer = detail.offers[0];
  return (
    <div className={cx(styles.bar, hidden && styles.hidden)} data-bottom-bar="">
      <p className={styles.price}>
        <span className={styles.label}>Best price</span>
        {formatPrice(offer.priceCents)}
      </p>
      <Button className={styles.button} onClick={() => addToCart(itemFromOffer(detail, offer))}>
        <ShoppingCart className={styles.icon} aria-hidden="true" />
        Add to cart
      </Button>
    </div>
  );
}
