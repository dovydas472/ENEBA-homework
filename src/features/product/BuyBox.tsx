import { ShoppingCart, Star } from "lucide-react";
import { PrefetchLink } from "../../components/PrefetchLink.tsx";
import type { ProductDetail } from "../../api/types.ts";
import { Button, ButtonLink } from "../../components/Button.tsx";
import { Price } from "../../components/Price.tsx";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import { discountPercent } from "../../lib/discount.ts";
import { formatPrice } from "../../lib/formatPrice.ts";
import { addToCart } from "../cart/addToCart.ts";
import { itemFromOffer } from "../cart/cart.ts";
import styles from "./BuyBox.module.css";
import { ratingText } from "./sellerText.ts";
import { variantName } from "./variantName.ts";

/**
 * The box on the right (P1): the CHEAPEST buyable offer = offers[0] (the API sorts them).
 * Eneba's box has "Buy now" + a cart icon; we have no checkout yet, so the one main action is "Add to cart".
 * Only rendered when there is at least one offer (otherwise OutOfStockBox).
 */
export function BuyBox({ detail }: { detail: ProductDetail }) {
  const offer = detail.offers[0];
  const msrp = detail.product.msrpCents;
  const others = detail.offers.length - 1;

  return (
    <section className={styles.box} aria-labelledby="buy-box-label">
      <p className={styles.label} id="buy-box-label">
        Best price
      </p>
      <Price
        cents={offer.priceCents}
        oldCents={msrp}
        discountPercent={discountPercent(offer.priceCents, msrp)}
        size="large"
        className={styles.price}
      />
      <p className={styles.seller}>
        Sold by <span className={styles.sellerName}>{offer.seller.name}</span>
        <span className={styles.rating}>
          {!offer.seller.isNew && <Star className={styles.star} aria-hidden="true" />}
          <VisuallyHidden>Seller rating: </VisuallyHidden>
          {ratingText(offer.seller)}
        </span>
      </p>
      <Button className={styles.button} onClick={() => addToCart(itemFromOffer(detail, offer))}>
        <ShoppingCart className={styles.buttonIcon} aria-hidden="true" />
        Add to cart
      </Button>
      {/* Eneba: "+19 offers from €18.70" under the buttons. Ours jumps to the list of offers on the same page. */}
      {others > 0 && (
        <a href="#offers" className={styles.more}>
          +{others} more {others === 1 ? "offer" : "offers"}
        </a>
      )}
    </section>
  );
}

/**
 * P6: instead of the buy box when no offer can be bought. Lists the versions of the same game that ARE in stock,
 * so the visitor is not left at a dead end; with none, a way back to the store.
 */
export function OutOfStockBox({ detail }: { detail: ProductDetail }) {
  const available = detail.variants.filter((v) => v.inStock);

  return (
    <section className={styles.box} aria-labelledby="out-of-stock-title">
      <h2 className={styles.outTitle} id="out-of-stock-title">
        Out of stock
      </h2>
      <p className={styles.outText}>No seller has this version right now.</p>
      {available.length > 0 ? (
        <>
          <p className={styles.outText}>Available versions:</p>
          <ul className={styles.available}>
            {available.map((variant) => (
              <li key={variant.slug}>
                <PrefetchLink to={`/product/${variant.slug}`} className={styles.availableLink}>
                  <span>{variantName(variant)}</span>
                  <span className={styles.availablePrice}>{formatPrice(variant.priceCents)}</span>
                </PrefetchLink>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ButtonLink to="/store" variant="secondary" className={styles.button}>
          Browse the store
        </ButtonLink>
      )}
    </section>
  );
}
