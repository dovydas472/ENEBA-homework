/**
 * True when the user is typing into this element (a text field, textarea, select or an
 * editable element). Keyboard shortcuts such as "/" must not fire then.
 */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return true;
  return el.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}
