import type { FacetOption } from "../../api/types.ts";
import styles from "./CheckboxFilter.module.css";

interface CheckboxFilterProps {
  /** Names the list for screen readers ("Platform"). */
  label: string;
  options: FacetOption[];
  /** Slugs that are ticked (they come from the URL). */
  selected: string[];
  /** Called with the new list of ticked slugs after every click. */
  onChange: (selected: string[]) => void;
}

/**
 * A list of checkboxes with a count behind each name (DESIGN.md 4.8): "Steam 54".
 * It is a controlled component: what is ticked is decided by `selected` (the URL), and a click only
 * asks for the new list, so the screen can never disagree with the URL.
 */
export function CheckboxFilter({ label, options, selected, onChange }: CheckboxFilterProps) {
  function toggle(slug: string) {
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);
  }

  return (
    <ul className={styles.list} aria-label={label}>
      {options.map((option) => (
        <li key={option.slug}>
          {/* The label wraps the input: the whole row is the click (and tap) target. */}
          <label className={styles.row}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={selected.includes(option.slug)}
              onChange={() => toggle(option.slug)}
            />
            <span className={styles.name}>{option.name}</span>
            <span className={styles.count}>{option.count}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
