import { cx } from "../../lib/cx.ts";
import { statusLabel } from "./orderText.ts";
import styles from "./StatusBadge.module.css";

/** The order status as a small outlined pill: Paid (mint), Pending payment (orange), Expired / Cancelled (grey). The word is always written. */
export function StatusBadge({ status }: { status: string }) {
  return <span className={cx(styles.badge, styles[status])}>{statusLabel(status)}</span>;
}
