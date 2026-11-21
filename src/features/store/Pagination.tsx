import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "../../lib/cx.ts";
import { pageList } from "./pageList.ts";
import styles from "./Pagination.module.css";

interface PaginationProps {
  /** The current page, 1-based. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * "‹  1 2 3 … 10  ›" (owner decision S5, drawn like Eneba's since Task 11b: the previous / next buttons are
 * square arrow buttons, named "Previous page" / "Next page" for screen readers). Which numbers to show is decided
 * by pageList(); the arrows are disabled at the first / last page. The current page is marked with aria-current="page".
 * With one page (or none) there is nothing to page through, so nothing is drawn.
 */
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className={styles.nav} aria-label="Pagination">
      <ul className={styles.list}>
        <li>
          <button
            type="button"
            className={styles.arrow}
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className={styles.icon} aria-hidden="true" />
          </button>
        </li>
        {pageList(page, totalPages).map((item, index) =>
          item === "…" ? (
            // The ellipsis is not a control: hidden from screen readers (the numbers around it say enough).
            <li key={`gap-${index}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={cx(styles.page, item === page && styles.current)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            </li>
          ),
        )}
        <li>
          <button
            type="button"
            className={styles.arrow}
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className={styles.icon} aria-hidden="true" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
