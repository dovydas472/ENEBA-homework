import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cx } from "../../lib/cx.ts";
import styles from "./FilterGroup.module.css";

/**
 * One block of the filter panel (DESIGN.md 4.8): a title that is also a button, and a body that it
 * folds away. aria-expanded tells screen readers whether the body is open; aria-controls says which element it controls.
 */
export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();

  return (
    <section className={styles.group}>
      <h3 className={styles.heading}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
        >
          {title}
          <ChevronDown className={cx(styles.chevron, !open && styles.collapsed)} aria-hidden="true" />
        </button>
      </h3>
      {/* `hidden` removes the body from the screen AND from the accessibility tree. */}
      <div id={bodyId} className={styles.body} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
