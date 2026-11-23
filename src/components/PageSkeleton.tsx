import styles from "./PageSkeleton.module.css";
import { Skeleton } from "./Skeleton.tsx";
import { VisuallyHidden } from "./VisuallyHidden.tsx";

/**
 * The page area while a lazily loaded page's code downloads on the first load (Task 17, the route HydrateFallback in
 * routes.ts): a title bar and a panel of lines, no "Loading…" text on screen (DESIGN.md 4.10). It is at least one
 * screen tall, so the footer stays below the fold and does not jump when the real page arrives.
 */
export function PageSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <VisuallyHidden>Loading the page…</VisuallyHidden>
      <Skeleton className={styles.title} />
      <div className={styles.panel}>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    </div>
  );
}
