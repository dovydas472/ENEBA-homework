import styles from "./PlaceholderPage.module.css";

/** Stand-in for a page that a later task builds: a title and one line. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>Coming in a later task.</p>
    </div>
  );
}
