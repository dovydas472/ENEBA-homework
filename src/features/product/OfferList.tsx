import { ShoppingCart, Star } from "lucide-react";
import type { Offer, ProductDetail } from "../../api/types.ts";
import { Button } from "../../components/Button.tsx";
import { Price } from "../../components/Price.tsx";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import { discountPercent } from "../../lib/discount.ts";
import { addToCart } from "../cart/addToCart.ts";
import { itemFromOffer } from "../cart/cart.ts";
import styles from "./OfferList.module.css";
import { ratingText, reviewsText } from "./sellerText.ts";

/** "Only N left" appears at this stock or below (owner decision P2). */
export const LOW_STOCK = 3;

/**
 * Every buyable offer of the product (P2), cheapest first - the API already sorts them and hides offers
 * without stock. Laid out like Eneba's offer rows (DESIGN.md 4.7).
 */
export function OfferList({ detail }: { detail: ProductDetail }) {
  const { offers } = detail;
  return (
    <section className={styles.section} aria-labelledby="offers-title" id="offers">
      <h2 className={styles.title} id="offers-title">
        <span className={styles.count}>{offers.length}</span> {offers.length === 1 ? "offer" : "offers"}
      </h2>
      <ul className={styles.list}>
        {offers.map((offer, index) => (
          <OfferRow key={offer.offerId} detail={detail} offer={offer} best={index === 0} />
        ))}
      </ul>
    </section>
  );
}

function OfferRow({ detail, offer, best }: { detail: ProductDetail; offer: Offer; best: boolean }) {
  const { seller } = offer;
  const msrp = detail.product.msrpCents;

  return (
    <li className={styles.row}>
      <div className={styles.seller}>
        {/* Eneba shows the seller's logo; we have none, so a letter in a circle (decorative). */}
        <span className={styles.avatar} aria-hidden="true">
          {seller.name.charAt(0)}
        </span>
        <div className={styles.sellerText}>
          <p className={styles.sellerName}>
            {seller.name}
            {/* The cheapest offer = the one in the buy box. Text, so colour is not the only signal. */}
            {best && <span className={styles.bestPrice}>Best price</span>}
          </p>
          <p className={styles.rating}>
            {seller.isNew ? (
              <span className={styles.newSeller}>New seller</span>
            ) : (
              <>
                <Star className={styles.star} aria-hidden="true" />
                <VisuallyHidden>Seller rating: </VisuallyHidden>
                <span className={styles.score}>{ratingText(seller)}</span>
                <span className={styles.reviews}>({reviewsText(seller.reviewsCount)})</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className={styles.buy}>
        <div className={styles.priceColumn}>
          <Price cents={offer.priceCents} oldCents={msrp} discountPercent={discountPercent(offer.priceCents, msrp)} size="row" />
          {offer.stock <= LOW_STOCK && <p className={styles.lowStock}>Only {offer.stock} left</p>}
        </div>
        {/* Secondary in a list; the buy box above uses the primary button (DESIGN.md 4.7). */}
        <Button variant="secondary" className={styles.button} onClick={() => addToCart(itemFromOffer(detail, offer))}>
          <ShoppingCart className={styles.buttonIcon} aria-hidden="true" />
          Add to cart
          <VisuallyHidden> from {seller.name}</VisuallyHidden>
        </Button>
      </div>
    </li>
  );
}
