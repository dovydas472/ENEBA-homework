import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { productListQuery } from "../../api/queries.ts";
import { ProductGrid, ProductGridSkeleton } from "./ProductGrid.tsx";
import styles from "./PopularProducts.module.css";

/** How many products the "Popular right now" block shows (owner decision Q5). */
export const POPULAR_COUNT = 8;

/**
 * "Popular right now": the first 8 products of the default listing (most popular first), shown under
 * "No results for 'q'" so a search that found nothing still offers somewhere to go (owner decision Q5).
 * It is an extra: if it fails to load it simply is not shown (the empty-state message above already explains the page).
 */
export function PopularProducts() {
  const headingId = useId();
  const query = useQuery(productListQuery({ pageSize: POPULAR_COUNT }));

  if (query.isError) return null;

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        Popular right now
      </h2>
      {query.data ? <ProductGrid items={query.data.items} /> : <ProductGridSkeleton count={POPULAR_COUNT} />}
    </section>
  );
}
