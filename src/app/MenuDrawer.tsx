import { X } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router";
import { APP_NAME } from "../lib/appInfo.ts";
import { useModalDialog } from "../lib/useModalDialog.ts";
import styles from "./MenuDrawer.module.css";
import { NAV_LINKS } from "./navLinks.ts";

interface MenuDrawerProps {
  open: boolean;
  /** Called when the menu closes, however it closes (close button, a link, Esc). */
  onClose: () => void;
}

/**
 * The phone menu behind the ☰ button (≤ 930 px, DESIGN.md 3.1): a full-screen native <dialog> with the same
 * links as the desktop nav strip. A click on a link closes it and the router navigates.
 */
export function MenuDrawer({ open, onClose }: MenuDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useModalDialog(dialog, open);

  return (
    // `onClose` also fires when the browser closed the dialog (Esc): then the state follows the DOM.
    <dialog ref={dialog} className={styles.menu} aria-label="Menu" onClose={onClose}>
      <div className={styles.top}>
        <Link to="/" className={styles.wordmark} onClick={onClose}>
          {APP_NAME}
        </Link>
        <button type="button" className={styles.close} aria-label="Close menu" onClick={onClose}>
          <X className={styles.icon} aria-hidden="true" />
        </button>
      </div>
      {/* Only while open, so the page never has two "Main" navigations at the same time. */}
      {open && (
        <nav aria-label="Main">
          <ul className={styles.list}>
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className={styles.link} onClick={onClose}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </dialog>
  );
}
