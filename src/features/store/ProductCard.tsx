import { ShoppingCart } from "lucide-react";
import { PrefetchLink } from "../../components/PrefetchLink.tsx";
import type { ProductItem } from "../../api/types.ts";
import { Badge } from "../../components/Badge.tsx";
import { Button, ButtonLink } from "../../components/Button.tsx";
import { Price } from "../../components/Price.tsx";
import { Skeleton } from "../../components/Skeleton.tsx";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import { cx } from "../../lib/cx.ts";
import { addToCart } from "../cart/addToCart.ts";
import { itemFromListing } from "../cart/cart.ts";
import { CoverImage } from "./CoverImage.tsx";
import styles from "./ProductCard.module.css";

/**
 * One product in the grid (DESIGN.md 4.3), laid out like Eneba's card.
 *  - desktop/tablet: cover with a dark platform strip at the bottom, then title, region (mint), price.
 *    On hover (or keyboard focus) the content slides up and shows "Add to cart" + "View offers", like Eneba.
 *  - phone (≤ 600 px): a horizontal list card, small cover on the left, a cart icon button bottom-right;
 *    the platform moves into the mint line, because a 70 px strip is too narrow for "Nintendo eShop".
 * The card link and the "Add to cart" button are SIBLINGS: a button inside a link is invalid HTML
 * (a click would mean two things). "Add to cart" adds the product's cheapest offer (Task 12);
 * an out-of-stock card has no button.
 */
export function ProductCard({ item }: { item: ProductItem }) {
  const buyable = item.inStock && item.priceCents !== null;
  const cartItem = itemFromListing(item); // null = nothing to add (out of stock)

  return (
    <div className={cx(styles.card, !buyable && styles.unavailable, cartItem && styles.withCart)}>
      <div className={styles.slide}>
        {/* Prefetch (S13, Task 17: PrefetchLink): resting the pointer on the card, focusing it or touching it already
            requests the product page data, so by the time the user clicks it is usually in the cache. */}
        <PrefetchLink to={`/product/${item.slug}`} className={styles.link}>
          <div className={styles.cover}>
            <CoverImage url={item.coverUrl} title={item.title} />
            {/* Desktop: the platform on a dark strip over the bottom of the cover (hidden on phones, see the CSS). */}
            <span className={styles.platformStrip}>{item.platform.name}</span>
          </div>
          <div className={styles.body}>
            <h3 className={styles.title}>{item.title}</h3>
            {/* "Standard" is the normal edition: only special editions are worth a line. */}
            {item.edition !== "Standard" && <p className={styles.edition}>{item.edition}</p>}
            <p className={styles.meta}>
              {/* Phones only: the platform joins the mint line (desktop shows it on the cover strip instead). */}
              <Badge variant="text" className={styles.metaPlatform}>
                {item.platform.name}
              </Badge>
              <Badge variant="text">{item.region.name}</Badge>
            </p>
            <div className={styles.priceArea}>
              {buyable ? (
                <Price
                  label="From"
                  cents={item.priceCents}
                  oldCents={item.msrpCents}
                  // The API sends null or 0 when there is no real discount; Price shows the badge only for > 0.
                  discountPercent={item.discountPercent}
                />
              ) : (
                <p className={styles.outOfStock}>Out of stock</p>
              )}
            </div>
          </div>
        </PrefetchLink>

        {/* Revealed by the hover slide (desktop). */}
        <div className={styles.actions}>
          {cartItem && (
            <Button className={styles.cartButton} onClick={() => addToCart(cartItem)}>
              <ShoppingCart className={styles.cartIcon} aria-hidden="true" />
              <span className={styles.cartLabel}>Add to cart</span>
              {/* "Add to cart: The Witcher 3" - the visible words come first (WCAG 2.5.3), then which product. */}
              <VisuallyHidden>: {item.title}</VisuallyHidden>
            </Button>
          )}
          {/* Looks like a secondary button, but it is only part of the card's look: the card link already says
              where it goes, so it is hidden from screen readers and from the Tab order. A click opens the product. */}
          <ButtonLink
            to={`/product/${item.slug}`}
            variant="secondary"
            className={styles.viewOffers}
            tabIndex={-1}
            aria-hidden="true"
          >
            View offers
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/** Same outer size as ProductCard (cover ratio + three bars), shown while the first page loads (DESIGN.md 4.10). */
export function ProductCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.slide}>
        <div className={styles.link}>
          <div className={styles.cover}>
            <Skeleton variant="block" className={styles.skeletonCover} />
          </div>
          <div className={styles.body}>
            <Skeleton className={styles.skeletonTitle} />
            <Skeleton className={styles.skeletonMeta} />
            <Skeleton className={styles.skeletonPrice} />
          </div>
        </div>
      </div>
    </div>
  );
}
