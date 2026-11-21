import { useId } from "react";
import { SORTS, type Sort } from "../../api/types.ts";
import { SORT_LABELS } from "./sortLabels.ts";
import styles from "./SortRadios.module.css";

interface SortRadiosProps {
  value: Sort;
  onChange: (sort: Sort) => void;
}

/**
 * The sort as radio buttons, inside the "Sort and filter" drawer on phones and tablets (Task 11b, as on Eneba).
 * Native radios with one shared `name`: the arrow keys move between them and screen readers say "1 of 6".
 * A change applies at once, like the filters (the results behind the drawer update).
 */
export function SortRadios({ value, onChange }: SortRadiosProps) {
  const name = useId(); // one group name per instance

  return (
    // role="radiogroup" names the group for screen readers ("Sort by, radio group").
    <div className={styles.list} role="radiogroup" aria-label="Sort by">
      {SORTS.map((sort) => (
        <label key={sort} className={styles.row}>
          <input
            type="radio"
            className={styles.radio}
            name={name}
            value={sort}
            checked={value === sort}
            onChange={() => onChange(sort)}
          />
          {SORT_LABELS[sort]}
        </label>
      ))}
    </div>
  );
}
