import { useEffect, type RefObject } from "react";
import { isTypingTarget } from "./isTypingTarget.ts";

/**
 * Pressing "/" anywhere on the page focuses the given input (the same shortcut GitHub and YouTube use).
 * It does nothing while the user is already typing in a field (then "/" is just a character),
 * and it ignores combinations like Ctrl+/ that belong to the browser.
 */
export function useSlashShortcut(inputRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      event.preventDefault(); // otherwise the "/" would be typed into the field we just focused
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [inputRef]);
}
