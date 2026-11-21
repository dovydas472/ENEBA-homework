import { Info } from "lucide-react";
import styles from "./DemoBanner.module.css";

/**
 * Notice above the header, on every page. It has NO close button on purpose: this is a demo shop
 * that imitates a real brand, so every visitor must always see that it is not the real thing
 * (otherwise a screenshot or a link to it could be used to mislead people, e.g. for phishing).
 */
export function DemoBanner() {
  return (
    <aside className={styles.banner} aria-label="Demo notice">
      <Info className={styles.icon} />
      <p className={styles.text}>
        Internship demo – not affiliated with Eneba. <span className={styles.nowrap}>Sign-in</span> and checkout are
        simulated.
      </p>
    </aside>
  );
}
