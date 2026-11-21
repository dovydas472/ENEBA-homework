import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { productQuery } from "../../api/queries.ts";
import type { ProductItem } from "../../api/types.ts";
import { Badge } from "../../components/Badge.tsx";
import { Price } from "../../components/Price.tsx";
import { Skeleton } from "../../components/Skeleton.tsx";
import { cx } from "../../lib/cx.ts";
import { CoverImage } from "./CoverImage.tsx";
import styles from "./ProductCard.module.css";

/** One product in the grid (DESIGN.md 4.3). The WHOLE card is one link to the product page. */
export function ProductCard({ item }: { item: ProductItem }) {
  const queryClient = useQueryClient();
  const buyable = item.inStock && item.priceCents !== null;

  // Prefetch (S13): while the pointer is over the card (or it has keyboard focus) the product page data is
  // already requested, so by the time the user clicks it is usually in the cache. prefetchQuery does nothing
  // when the cache entry is still fresh (staleTime), so moving over a card again costs no request.
  // prefetchQuery never throws: a failed prefetch shows nothing - the product page itself asks again
  // and shows its own error state.
  function prefetch() {
    void queryClient.prefetchQuery(productQuery(item.slug));
  }

  return (
    <Link
      to={`/product/${item.slug}`}
      className={cx(styles.card, !buyable && styles.unavailable)}
      onMouseEnter={prefetch}
      onFocus={prefetch}
    >
      <CoverImage url={item.coverUrl} title={item.title} />
      <div className={styles.body}>
        <h3 className={styles.title}>{item.title}</h3>
        {/* "Standard" is the normal edition: only special editions are worth a line. */}
        {item.edition !== "Standard" && <p className={styles.edition}>{item.edition}</p>}
        <p className={styles.meta}>
          <Badge variant="text">{item.platform.name}</Badge>
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
    </Link>
  );
}

/** Same outer size as ProductCard (cover ratio + three bars), shown while the first page loads (DESIGN.md 4.10). */
export function ProductCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <Skeleton variant="block" className={styles.skeletonCover} />
      <div className={styles.body}>
        <Skeleton className={styles.skeletonTitle} />
        <Skeleton className={styles.skeletonMeta} />
        <Skeleton className={styles.skeletonPrice} />
      </div>
    </div>
  );
}
