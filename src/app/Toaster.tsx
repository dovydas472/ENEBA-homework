import { CircleCheck, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PrefetchLink } from "../components/PrefetchLink.tsx";
import { cx } from "../lib/cx.ts";
import { dismissToast, useToast, type Toast } from "../lib/toast.ts";
import styles from "./Toaster.module.css";

/** DESIGN.md 4.11: a toast disappears after 5 s, but not while the pointer or the keyboard focus is on it. */
export const TOAST_DURATION_MS = 5_000;

/**
 * Shows the current toast (src/lib/toast.ts) in the bottom corner. The wrapper is ALWAYS rendered:
 * screen readers announce only text that appears inside a live region that already existed (role="status").
 */
export function Toaster() {
  const toast = useToast();
  return (
    <div className={styles.region} role="status">
      {/* key: a new toast is a new component, so its timer starts again. */}
      {toast && <ToastBox key={toast.id} toast={toast} />}
    </div>
  );
}

function ToastBox({ toast }: { toast: Toast }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  // The 5 s countdown runs only while the toast is not "in use"; it starts again from 5 s after a pause.
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => dismissToast(toast.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [paused, toast.id]);

  const Icon = toast.kind === "success" ? CircleCheck : Info;

  return (
    <div
      className={cx(styles.toast, styles[toast.kind])}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        // Moving focus between the link and the × stays "focused"; leaving the toast ends the pause.
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <Icon className={styles.icon} aria-hidden="true" />
      <p className={styles.message}>{toast.message}</p>
      {toast.action && (
        <PrefetchLink to={toast.action.to} className={styles.action} onClick={() => dismissToast(toast.id)}>
          {toast.action.label}
        </PrefetchLink>
      )}
      <button type="button" className={styles.close} aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
        <X className={styles.closeIcon} aria-hidden="true" />
      </button>
    </div>
  );
}
