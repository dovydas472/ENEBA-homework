import { ChevronRight } from "lucide-react";
import { PrefetchLink } from "../../components/PrefetchLink.tsx";
import type { Variant } from "../../api/types.ts";
import { cx } from "../../lib/cx.ts";
import { formatPrice } from "../../lib/formatPrice.ts";
import styles from "./VariantList.module.css";

/**
 * "Other versions" (P3): the other products of the same game - another platform, region or edition - each a link
 * to its own page. Eneba has no such list on the product page (it lives in its search), so the rows reuse the
 * offer-row look; a whole row is one link, so it gets a hover colour (DESIGN.md 4.7). Like a Store card it is a
 * PrefetchLink: the page data is usually in the cache before the click.
 */
export function VariantList({ variants }: { variants: Variant[] }) {
  if (variants.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="variants-title">
      <h2 className={styles.title} id="variants-title">
        Other versions
      </h2>
      <ul className={styles.list}>
        {variants.map((variant) => (
          <li key={variant.slug}>
            <PrefetchLink
              to={`/product/${variant.slug}`}
              className={cx(styles.row, !variant.inStock && styles.unavailable)}
            >
              <span className={styles.name}>
                <span className={styles.platform}>{variant.platform.name}</span>
                <span className={styles.region}>{variant.region.name}</span>
                {variant.edition !== "Standard" && <span className={styles.edition}>{variant.edition}</span>}
              </span>
              <span className={styles.price}>
                {variant.inStock ? (
                  <>
                    <span className={styles.from}>From</span> {formatPrice(variant.priceCents)}
                  </>
                ) : (
                  <span className={styles.outOfStock}>Out of stock</span>
                )}
              </span>
              <ChevronRight className={styles.chevron} aria-hidden="true" />
            </PrefetchLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
