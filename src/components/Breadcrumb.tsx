import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import styles from "./Breadcrumb.module.css";

export interface Crumb {
  label: string;
  /** Path of the page; the last crumb (the current page) has none. */
  to?: string;
}

/**
 * "Store › The Witcher 3" (product page, owner decision P4). A <nav> with an ordered list, the current page marked
 * aria-current="page" (the usual breadcrumb pattern for screen readers). Hidden on phones, like on Eneba.
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <ol className={styles.list}>
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className={styles.item}>
            {index > 0 && <ChevronRight className={styles.separator} aria-hidden="true" />}
            {item.to ? (
              <Link to={item.to} className={styles.link}>
                {item.label}
              </Link>
            ) : (
              <span className={styles.current} aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
