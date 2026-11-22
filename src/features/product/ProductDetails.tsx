import type { ProductDetail } from "../../api/types.ts";
import { cx } from "../../lib/cx.ts";
import { formatReleaseDate } from "../../lib/formatDate.ts";
import styles from "./ProductDetails.module.css";

/**
 * P4, laid out like Eneba's lower part of the page: "Product details" (genre tags + the description panel)
 * and "Other details" (a label/value list: release date, developer, publisher...). Unknown values are left out.
 */
export function ProductDetails({ detail }: { detail: ProductDetail }) {
  const { game, product } = detail;
  const rows: [label: string, value: string | null][] = [
    ["Release date", game.releaseDate ? formatReleaseDate(game.releaseDate) : null],
    ["Developer", game.developer],
    ["Publisher", game.publisher],
    ["Platform", product.platform.name],
    ["Region", product.region.name],
    ["Edition", product.edition],
  ];
  const facts = rows.filter((row): row is [string, string] => row[1] !== null && row[1] !== "");

  return (
    <>
      {(game.genres.length > 0 || game.description) && (
        <section className={styles.section} aria-labelledby="details-title">
          <h2 className={styles.title} id="details-title">
            Product details
          </h2>
          {game.genres.length > 0 && (
            <ul className={styles.genres} aria-label="Genres">
              {game.genres.map((genre) => (
                <li key={genre} className={styles.genre}>
                  {genre}
                </li>
              ))}
            </ul>
          )}
          {game.description && (
            <div>
              {/* Eneba shows tabs here ("Description", "Activation guide"); we only have a description, so the
                  tab look is just its heading - not a control. */}
              <h3 className={styles.tab}>Description</h3>
              <p className={cx(styles.panel, styles.description)}>{game.description}</p>
            </div>
          )}
        </section>
      )}

      <section className={styles.section} aria-labelledby="other-details-title">
        <h2 className={styles.title} id="other-details-title">
          Other details
        </h2>
        <dl className={cx(styles.panel, styles.facts)}>
          {facts.map(([label, value]) => (
            <div key={label} className={styles.fact}>
              <dt className={styles.factLabel}>{label}</dt>
              <dd className={styles.factValue}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
