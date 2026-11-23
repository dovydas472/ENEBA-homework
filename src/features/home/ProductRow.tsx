import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { homeBlockQuery } from "../../api/queries.ts";
import type { ProductRowBlockData } from "../../api/types.ts";
import { ButtonLink } from "../../components/Button.tsx";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import { ProductCard, ProductCardSkeleton } from "../store/ProductCard.tsx";
import type { BlockProps } from "./blockTypes.ts";
import { BlockError } from "./BlockError.tsx";
import styles from "./ProductRow.module.css";

/** Placeholder cards while loading (the usual row length; the real number comes from the block's config). */
const SKELETON_CARDS = 5;

/**
 * Product row block (H4): a heading, the Store's product cards (with "Add to cart") and "View all", which opens
 * the Store with the same sort. Which products, how many and the link all come from the block's endpoint.
 */
export function ProductRow({ block }: BlockProps) {
  const headingId = useId();
  const query = useQuery(homeBlockQuery<ProductRowBlockData>(block.endpoint));

  return (
    <section className={styles.band} aria-labelledby={headingId}>
      <div className={styles.inner}>
        <h2 id={headingId} className={styles.title}>
          {block.title}
        </h2>
        {query.isPending && (
          <ul className={styles.grid} aria-busy="true">
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <li key={i} className={styles.item}>
                <ProductCardSkeleton />
              </li>
            ))}
          </ul>
        )}
        {query.isError && <BlockError title={block.title} onRetry={() => void query.refetch()} retrying={query.isFetching} />}
        {query.data && (
          <>
            <ul className={styles.grid}>
              {query.data.items.map((item) => (
                <li key={item.slug} className={styles.item}>
                  <ProductCard item={item} />
                </li>
              ))}
            </ul>
            <div className={styles.viewAll}>
              <ButtonLink to={query.data.viewAllHref} variant="secondary" className={styles.viewAllButton}>
                View all
                {/* Three "View all" links on one page: the hidden part says which one (visible words first, WCAG 2.5.3). */}
                <VisuallyHidden>: {block.title}</VisuallyHidden>
              </ButtonLink>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
