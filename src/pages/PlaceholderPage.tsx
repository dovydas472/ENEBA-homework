import type { ReactNode } from "react";
import styles from "./PlaceholderPage.module.css";

/** Stand-in for a page that a later task builds: a title, one line, and optional actions (e.g. a link to the Store). */
export function PlaceholderPage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>Coming in a later task.</p>
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  );
}
