import styles from "./SlowServerNotice.module.css";
import { useSlowRequests } from "./useSlowRequests.ts";

/**
 * Small notice in the corner, shown when some API request has been pending for more than 1.5 s
 * (the free-tier server or database is waking up). It does not block anything: no overlay, no focus.
 * The wrapper is always in the page (role="status" = polite live region), because screen readers
 * only announce text that appears INSIDE a region that already existed.
 */
export function SlowServerNotice() {
  const slow = useSlowRequests();

  return (
    <div className={styles.region} role="status">
      {slow && <p className={styles.notice}>Waking up the server, this can take a few seconds…</p>}
    </div>
  );
}
