import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { SORTS, type Sort } from "../../api/types.ts";
import styles from "./SortSelect.module.css";

/** The words for each sort value (owner decision S9). `Record<Sort, string>` makes TypeScript complain if a sort has no label. */
const LABELS: Record<Sort, string> = {
  popularity: "Most popular",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  discount: "Biggest discount",
  newest: "Newest",
  title: "Name A–Z",
};

interface SortSelectProps {
  value: Sort;
  onChange: (sort: Sort) => void;
}

/**
 * The sort dropdown. It is a native <select> (DESIGN.md 4.6 prefers it): keyboard, screen readers and the
 * phone's own picker work without any code of ours. The chevron is only decoration drawn over it.
 */
export function SortSelect({ value, onChange }: SortSelectProps) {
  const id = useId();

  return (
    <div className={styles.sort}>
      <label htmlFor={id} className={styles.label}>
        Sort by
      </label>
      <div className={styles.wrapper}>
        <select
          id={id}
          className={styles.select}
          value={value}
          // The option values come from SORTS, so the cast is safe.
          onChange={(event) => onChange(event.target.value as Sort)}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {LABELS[sort]}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </div>
    </div>
  );
}
