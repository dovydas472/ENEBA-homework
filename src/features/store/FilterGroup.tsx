import { ChevronUp } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import { cx } from "../../lib/cx.ts";
import styles from "./FilterGroup.module.css";

interface FilterGroupProps {
  title: string;
  /** How many options of this group are ticked; > 0 shows a small yellow badge next to the title (as on Eneba). */
  selectedCount?: number;
  children: ReactNode;
}

/**
 * One block of the filter panel (DESIGN.md 4.8): a title that is also a button, and a body that it
 * folds away. aria-expanded tells screen readers whether the body is open; aria-controls says which element it controls.
 */
export function FilterGroup({ title, selectedCount = 0, children }: FilterGroupProps) {
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
          <span className={styles.title}>{title}</span>
          {selectedCount > 0 && (
            <span className={styles.badge}>
              {selectedCount}
              <VisuallyHidden> selected</VisuallyHidden>
            </span>
          )}
          {/* Points up while the group is open, down while it is folded. */}
          <ChevronUp className={cx(styles.chevron, !open && styles.collapsed)} aria-hidden="true" />
        </button>
      </h3>
      {/* `hidden` removes the body from the screen AND from the accessibility tree. */}
      <div id={bodyId} className={styles.body} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
