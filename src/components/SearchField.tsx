import { Search } from "lucide-react";
import type { FormEvent, Ref } from "react";
import styles from "./SearchField.module.css";

interface SearchFieldProps {
  /** Called with the text when the user submits (Enter or the magnifier button). It is NOT trimmed or checked. */
  onSearch: (text: string) => void;
  /** Initial text. The field is uncontrolled; give it a new `key` to reset it from outside. */
  defaultValue?: string;
  /** Accessible name of the field (there is no visible label). */
  label?: string;
  placeholder?: string;
  /** Lets the parent focus the input (the "/" shortcut). */
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * The search box (DESIGN.md 4.2 / 3.1): a form with a magnifier submit button and a text input.
 * The border and focus ring are on the wrapper, so the ring surrounds the whole field.
 */
export function SearchField({ onSearch, defaultValue, label = "Search", placeholder, inputRef }: SearchFieldProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); // no page reload: the parent navigates with the router
    const text = new FormData(event.currentTarget).get("q");
    onSearch(typeof text === "string" ? text : "");
  }

  return (
    <form className={styles.field} role="search" onSubmit={handleSubmit}>
      <button type="submit" className={styles.submit} aria-label={label}>
        <Search className={styles.icon} />
      </button>
      <input
        ref={inputRef}
        className={styles.input}
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        enterKeyHint="search"
      />
    </form>
  );
}
