import { ArrowDownWideNarrow, ChevronDown } from "lucide-react";
import { useId } from "react";
import { SORTS, type Sort } from "../../api/types.ts";
import { cx } from "../../lib/cx.ts";
import { SORT_LABELS } from "./sortLabels.ts";
import styles from "./SortSelect.module.css";

interface SortSelectProps {
  value: Sort;
  onChange: (sort: Sort) => void;
  className?: string;
}

/**
 * The desktop sort control. It LOOKS like Eneba's text button (sort icon, bold text, chevron), but it is a
 * native <select> (DESIGN.md 4.6): keyboard, screen readers and the browser's own list work without code of ours.
 * The "Sort by" label is for screen readers only; the icon says it visually. On phones the sort is in the drawer.
 */
export function SortSelect({ value, onChange, className }: SortSelectProps) {
  const id = useId();

  return (
    <div className={cx(styles.sort, className)}>
      <label htmlFor={id} className={styles.label}>
        Sort by
      </label>
      <ArrowDownWideNarrow className={styles.sortIcon} aria-hidden="true" />
      <select
        id={id}
        className={styles.select}
        value={value}
        // The option values come from SORTS, so the cast is safe.
        onChange={(event) => onChange(event.target.value as Sort)}
      >
        {SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </option>
        ))}
      </select>
      <ChevronDown className={styles.chevron} aria-hidden="true" />
    </div>
  );
}
