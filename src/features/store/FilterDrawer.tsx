import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "../../components/Button.tsx";
import styles from "./FilterDrawer.module.css";

interface FilterDrawerProps {
  open: boolean;
  /** Called when the drawer closes, however it closes (button, Esc). */
  onClose: () => void;
  /** Total number of results, for the "Show N results" button. undefined while loading. */
  resultCount: number | undefined;
  children: ReactNode;
}

/**
 * The mobile filter drawer (owner decision S3): a full-screen panel over the page.
 *
 * It is a native <dialog> opened with showModal(). The browser then does the hard parts for us:
 *  - FOCUS TRAP: everything outside the dialog becomes inert, so Tab cycles inside it and a screen reader
 *    cannot wander into the page behind (with a plain <div> we would have to write that ourselves);
 *  - Esc closes it;
 *  - when it closes, focus goes back to the button that opened it.
 * The filters inside change the URL instantly, so the results behind update while the drawer is open;
 * "Show N results" only closes it.
 */
export function FilterDrawer({ open, onClose, resultCount, children }: FilterDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // React state -> the dialog element. `open` is the single source of truth.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const buttonText =
    resultCount === undefined ? "Show results" : `Show ${resultCount} ${resultCount === 1 ? "result" : "results"}`;

  return (
    // `onClose` fires after the dialog closed, also when the browser closed it (Esc): then state follows the DOM.
    <dialog ref={dialog} className={styles.drawer} aria-labelledby={titleId} onClose={onClose}>
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          Filters
        </h2>
        <button type="button" className={styles.close} aria-label="Close filters" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      {/* Only while open: otherwise the sidebar and the drawer would both hold the same controls. */}
      <div className={styles.content}>{open && children}</div>
      <div className={styles.footer}>
        <Button onClick={onClose}>{buttonText}</Button>
      </div>
    </dialog>
  );
}
