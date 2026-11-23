import { ChevronDown, User as UserIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { PrefetchLink } from "../components/PrefetchLink.tsx";
import { displayName, type User } from "../api/auth.ts";
import { useSignOut } from "../features/auth/useSignOut.ts";
import { cx } from "../lib/cx.ts";
import styles from "./AccountMenu.module.css";

interface AccountMenuProps {
  user: User;
  /** The header's icon-link look, so the button matches the cart icon next to it. */
  buttonClassName?: string;
}

/**
 * The header account menu for a signed-in user (Task 14, A8): a button with the email (or "Demo user") that opens
 * a small menu with "Orders" and "Sign out".
 *
 * It is a DISCLOSURE (a button that shows/hides a list of links), not an ARIA role="menu": the items are an
 * ordinary link and button, so Tab / Shift+Tab / Enter work as everywhere else on the page.
 *   - the button says whether the list is open (aria-expanded) and which element it opens (aria-controls);
 *   - Esc closes it and puts the focus back on the button;
 *   - a click outside, or Tab moving the focus out of it, closes it too.
 */
export function AccountMenu({ user, buttonClassName }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const { signOut } = useSignOut();
  const name = displayName(user);

  // A click (or tap) anywhere outside closes the menu. Listening only while it is open keeps it cheap.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
  }

  // Focus moved to something outside the menu (Tab past the last item): close it.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  return (
    <div ref={root} className={styles.account} onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <button
        ref={button}
        type="button"
        className={cx(buttonClassName, styles.button)}
        // The visible text is the name; the label adds what the button is for (and is all there is on phones).
        aria-label={`Account: ${name}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <UserIcon className={styles.icon} aria-hidden="true" />
        <span className={styles.name}>{name}</span>
        <ChevronDown className={cx(styles.chevron, open && styles.chevronOpen)} aria-hidden="true" />
      </button>

      {/* `hidden` (not unmounting) keeps aria-controls pointing at a real element. */}
      <div id={menuId} className={styles.popup} hidden={!open}>
        <p className={styles.who}>
          Signed in as <span className={styles.whoName}>{name}</span>
        </p>
        <ul className={styles.list}>
          <li>
            <PrefetchLink to="/orders" className={styles.item} onClick={() => setOpen(false)}>
              Orders
            </PrefetchLink>
          </li>
          <li>
            <button
              type="button"
              className={styles.item}
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
