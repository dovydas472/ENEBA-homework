import { X } from "lucide-react";
import { useRef } from "react";
import { useLocation } from "react-router";
import { PrefetchLink } from "../components/PrefetchLink.tsx";
import { displayName } from "../api/auth.ts";
import { useCurrentUser } from "../features/auth/useCurrentUser.ts";
import { useSignOut } from "../features/auth/useSignOut.ts";
import { APP_NAME } from "../lib/appInfo.ts";
import { authPageLink } from "../lib/safeNext.ts";
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
 * links as the desktop nav strip, and under them the account part (Task 14): "Sign in" / "Create account", or
 * "Signed in as …" with "Orders" and "Sign out" - the same choices as the header account menu.
 * A click on a link closes it and the router navigates.
 */
export function MenuDrawer({ open, onClose }: MenuDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useModalDialog(dialog, open);
  const { user } = useCurrentUser();
  const { signOut } = useSignOut();
  // Like the header's "Sign in": after signing in, come back to the page the menu was opened on.
  const { pathname, search } = useLocation();
  const here = pathname + search;

  return (
    // `onClose` also fires when the browser closed the dialog (Esc): then the state follows the DOM.
    <dialog ref={dialog} className={styles.menu} aria-label="Menu" onClose={onClose}>
      <div className={styles.top}>
        <PrefetchLink to="/" className={styles.wordmark} onClick={onClose}>
          {APP_NAME}
        </PrefetchLink>
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
                <PrefetchLink to={link.to} className={styles.link} onClick={onClose}>
                  {link.label}
                </PrefetchLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {open && (
        <section className={styles.account} aria-label="Account">
          {user && (
            <p className={styles.who}>
              Signed in as <span className={styles.whoName}>{displayName(user)}</span>
            </p>
          )}
          <ul className={styles.list}>
            {user ? (
              <>
                <li>
                  <PrefetchLink to="/orders" className={styles.link} onClick={onClose}>
                    Orders
                  </PrefetchLink>
                </li>
                <li>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => {
                      onClose();
                      signOut();
                    }}
                  >
                    Sign out
                  </button>
                </li>
              </>
            ) : (
              <>
                <li>
                  <PrefetchLink to={authPageLink("/login", here)} className={styles.link} onClick={onClose}>
                    Sign in
                  </PrefetchLink>
                </li>
                <li>
                  <PrefetchLink to={authPageLink("/register", here)} className={styles.link} onClick={onClose}>
                    Create account
                  </PrefetchLink>
                </li>
              </>
            )}
          </ul>
        </section>
      )}
    </dialog>
  );
}
