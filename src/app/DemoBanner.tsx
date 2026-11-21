import { Info } from "lucide-react";
import styles from "./DemoBanner.module.css";

/**
 * Notice above the header, on every page. It has NO close button on purpose: this is a demo shop
 * that imitates a real brand, so every visitor must always see that it is not the real thing
 * (otherwise a screenshot or a link to it could be used to mislead people, e.g. for phishing).
 */
export function DemoBanner() {
  return (
    <div className={styles.banner} role="note">
      <Info className={styles.icon} />
      <p>Internship demo – not affiliated with Eneba. Sign-in and checkout are simulated.</p>
    </div>
  );
}
