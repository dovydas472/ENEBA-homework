import type { ProductItem } from "../../api/types.ts";
import { cx } from "../../lib/cx.ts";
import { ProductCard, ProductCardSkeleton } from "./ProductCard.tsx";
import styles from "./ProductGrid.module.css";

/**
 * The grid of cards. While the next result loads (`dimmed`), the old cards stay on screen, a bit transparent,
 * and aria-busy tells screen readers that the list is being updated.
 */
export function ProductGrid({ items, dimmed = false }: { items: ProductItem[]; dimmed?: boolean }) {
  return (
    <ul className={cx(styles.grid, dimmed && styles.dimmed)} aria-busy={dimmed || undefined}>
      {items.map((item) => (
        <li key={item.slug} className={styles.item}>
          <ProductCard item={item} />
        </li>
      ))}
    </ul>
  );
}

/** Placeholder cards for the very first load (nothing to show yet). 24 = one full page. */
export function ProductGridSkeleton({ count = 24 }: { count?: number }) {
  return (
    <ul className={styles.grid} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={styles.item}>
          <ProductCardSkeleton />
        </li>
      ))}
    </ul>
  );
}
