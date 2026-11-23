import { useQuery } from "@tanstack/react-query";
import { PrefetchLink } from "../../components/PrefetchLink.tsx";
import { homeBlockQuery } from "../../api/queries.ts";
import type { TilesBlockData } from "../../api/types.ts";
import { Skeleton } from "../../components/Skeleton.tsx";
import { cx } from "../../lib/cx.ts";
import type { BlockProps } from "./blockTypes.ts";
import { BlockError } from "./BlockError.tsx";
import styles from "./SideTiles.module.css";

/** The server sends an accent NAME; each name is one token gradient. An unknown name gets the default. */
const ACCENTS: Record<string, string | undefined> = {
  violet: styles.violet,
  promo: styles.promo,
  mint: styles.mint,
};

/** Placeholders while the tiles load (the usual number of tiles, so the row keeps its size). */
const SKELETON_TILES = 3;

/**
 * Side tiles block (H2): our own small banners next to the carousel - a title, a short line and a collage of
 * catalog covers on a token gradient (no Eneba artwork). Each tile is one link into the Store.
 */
export function SideTiles({ block }: BlockProps) {
  const query = useQuery(homeBlockQuery<TilesBlockData>(block.endpoint));

  if (query.isPending) {
    return (
      <ul className={styles.list} aria-hidden="true">
        {Array.from({ length: SKELETON_TILES }, (_, i) => (
          <li key={i} className={styles.tile}>
            <Skeleton variant="block" className={styles.skeleton} />
          </li>
        ))}
      </ul>
    );
  }
  if (query.isError) {
    return <BlockError title={block.title} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (query.data.tiles.length === 0) return null;

  return (
    <section aria-label={block.title}>
      <ul className={styles.list}>
        {query.data.tiles.map((tile) => (
          <li key={tile.id}>
            <PrefetchLink to={tile.href} className={cx(styles.tile, ACCENTS[tile.accent] ?? styles.violet)}>
              <span className={styles.title}>{tile.title}</span>
              {tile.subtitle && <span className={styles.subtitle}>{tile.subtitle}</span>}
              {/* Decoration only: the link's name is the text above. */}
              {tile.coverUrls.length > 0 && (
                <span className={styles.covers} aria-hidden="true">
                  {tile.coverUrls.map((url) => (
                    <img key={url} className={styles.cover} src={url} alt="" loading="lazy" decoding="async" />
                  ))}
                </span>
              )}
            </PrefetchLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
