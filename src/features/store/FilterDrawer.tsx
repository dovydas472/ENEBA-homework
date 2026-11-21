import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { Button } from "../../components/Button.tsx";
import { useModalDialog } from "../../lib/useModalDialog.ts";
import styles from "./FilterDrawer.module.css";

interface FilterDrawerProps {
  open: boolean;
  /** Called when the drawer closes, however it closes (button, Esc, a click on the dimmed page). */
  onClose: () => void;
  /** Total number of results, for the "Show N results" button. undefined while loading. */
  resultCount: number | undefined;
  children: ReactNode;
}

/**
 * "Sort and filter" on phones and tablets (Task 11b, as on Eneba): a 300 px panel that slides in from the left
 * over the dimmed page. It holds the sort radios and the same filter groups as the desktop sidebar.
 *
 * It is a native <dialog> opened with showModal() (see useModalDialog): focus trap, Esc and focus return come
 * from the browser. Sort and filters change the URL instantly, so the results behind update while the drawer
 * is open; "Show N results" only closes it.
 */
export function FilterDrawer({ open, onClose, resultCount, children }: FilterDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useModalDialog(dialog, open);

  const buttonText =
    resultCount === undefined ? "Show results" : `Show ${resultCount} ${resultCount === 1 ? "result" : "results"}`;

  return (
    // `onClose` fires after the dialog closed, also when the browser closed it (Esc): then state follows the DOM.
    // A click on the dimmed page behind lands on the <dialog> element itself (the panel is its only child area),
    // so `event.target === event.currentTarget` means "outside the panel" and closes it, like on Eneba.
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Sort and filter
          </h2>
          <button type="button" className={styles.close} aria-label="Close filters" onClick={onClose}>
            <X className={styles.closeIcon} aria-hidden="true" />
          </button>
        </div>
        {/* Only while open: otherwise the sidebar and the drawer would both hold the same controls. */}
        <div className={styles.content}>{open && children}</div>
        <div className={styles.footer}>
          <Button onClick={onClose}>{buttonText}</Button>
        </div>
      </div>
    </dialog>
  );
}
