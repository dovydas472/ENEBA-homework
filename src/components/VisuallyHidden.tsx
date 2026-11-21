import type { ReactNode } from "react";
import styles from "./VisuallyHidden.module.css";

/** Text for screen readers only (e.g. "Original price" before a struck-through price). */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className={styles.hidden}>{children}</span>;
}
