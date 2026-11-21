import { useEffect, type RefObject } from "react";

/**
 * Keeps a native <dialog> in sync with React state: `open` true -> showModal(), false -> close().
 * React state is the single source of truth; the dialog's own `close` event (Esc) must call the
 * component's onClose so the state follows the DOM.
 *
 * showModal() (not show()) is what gives us the hard parts for free: everything outside the dialog
 * becomes inert (a focus trap), Esc closes it, and focus returns to the button that opened it.
 * Used by the filter drawer and the phone menu.
 */
export function useModalDialog(dialogRef: RefObject<HTMLDialogElement | null>, open: boolean) {
  useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [dialogRef, open]);
}
