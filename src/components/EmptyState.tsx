import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  title: string;
  /** Heading level of the title: h2 inside a page (default), h1 when this block IS the whole page (404). */
  as?: "h1" | "h2";
  /** One line of help text. */
  message?: string;
  /** Optional action under the text: a Button ("Reset filters") or a Link. */
  children?: ReactNode;
}

/** "Nothing here" block (no results, page not found...). Centered inside the content area (DESIGN.md 4.9). */
export function EmptyState({ title, as: Heading = "h2", message, children }: EmptyStateProps) {
  return (
    <div className={styles.state}>
      <Heading className={styles.title}>{title}</Heading>
      {message && <p className={styles.message}>{message}</p>}
      {children}
    </div>
  );
}
