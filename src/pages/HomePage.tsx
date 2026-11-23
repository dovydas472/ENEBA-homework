import { useQuery } from "@tanstack/react-query";
import { homepageQuery } from "../api/queries.ts";
import { ButtonLink } from "../components/Button.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorState } from "../components/ErrorState.tsx";
import { Skeleton } from "../components/Skeleton.tsx";
import { VisuallyHidden } from "../components/VisuallyHidden.tsx";
import { BlockRenderer } from "../features/home/BlockRenderer.tsx";
import { preloadHeroImage } from "../features/home/heroImage.ts";
import { APP_NAME } from "../lib/appInfo.ts";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import styles from "./HomePage.module.css";

/**
 * The home page (Task 15) is assembled from blocks the SERVER lists (GET /api/homepage): which blocks, in which
 * order, with which titles. This component only lays them out; each block fetches its own content from its own
 * endpoint (BlockRenderer -> HeroCarousel, SideTiles, PlatformRow, ProductRow), so one failing block never
 * breaks the others. There is no home page content in the frontend.
 *
 * data-full-bleed-page tells the layout to drop its max width and padding (Layout.module.css): the hero and the
 * product row bands run edge to edge, like Eneba's; each block centres its own content.
 */
export function HomePage() {
  useDocumentTitle(); // home = no page name in the tab title
  const query = useQuery(homepageQuery());

  // Task 17 (LCP): the registry names the first hero picture, so its download starts NOW - in parallel with the
  // block requests - instead of after GET /api/blocks/hero. preload() may be called while rendering (React adds the
  // <link> once); it only names a file, it shows nothing.
  const heroImage = query.data?.preload?.heroImage;
  if (heroImage) preloadHeroImage(heroImage);

  return (
    <div className={styles.page} data-full-bleed-page>
      {/* One h1 per page (screen readers jump to it); the banner art already shows what the site is. */}
      <h1>
        <VisuallyHidden>{APP_NAME} – game keys</VisuallyHidden>
      </h1>

      {query.isPending && (
        // Until the list arrives: a placeholder of the hero's size, and the page stays a screen tall, so the
        // footer is not on screen and nothing visible moves when the blocks come (CLS).
        <div className={styles.loading} aria-busy="true">
          <Skeleton variant="block" className={styles.heroSkeleton} />
        </div>
      )}

      {query.isError && (
        <div className={styles.inner}>
          <ErrorState message="The home page could not be loaded." onRetry={() => void query.refetch()} retrying={query.isFetching} />
        </div>
      )}

      {query.data && query.data.blocks.length === 0 && (
        <div className={styles.inner}>
          <EmptyState title="Nothing to show here yet" message="The store is open, though.">
            <ButtonLink to="/store">Browse the store</ButtonLink>
          </EmptyState>
        </div>
      )}

      {query.data && query.data.blocks.length > 0 && (
        <div className={styles.blocks}>
          {query.data.blocks.map((block) => (
            <BlockRenderer key={block.key} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}
