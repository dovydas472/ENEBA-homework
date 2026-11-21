import type { ReactNode } from "react";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import styles from "./FilterSidebar.module.css";

/**
 * The desktop filter column (DESIGN.md 3.2). Below 930 px it is hidden by CSS and the same filters
 * are shown in the FilterDrawer instead.
 */
export function FilterSidebar({ children }: { children: ReactNode }) {
  return (
    <aside className={styles.sidebar} aria-label="Filters">
      <h2>
        <VisuallyHidden>Filters</VisuallyHidden>
      </h2>
      {children}
    </aside>
  );
}
