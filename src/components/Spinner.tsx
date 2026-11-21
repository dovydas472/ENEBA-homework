import styles from "./Spinner.module.css";

/** A small turning ring for "something is loading" (DESIGN.md 4 "Loading"). Decorative: put the words in a VisuallyHidden next to it. */
export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}
