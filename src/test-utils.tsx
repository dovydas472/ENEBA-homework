// Tiny helper for component/hook tests (jsdom). The project has no Testing Library, so we render
// with React's own createRoot inside act().
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

// Tell React that this environment is a test (enables act() and silences its warning).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Renders `ui` into a fresh <div> that is attached to the document (so focus works). */
export function render(ui: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    container,
    /** Renders something else into the same root (same component = its state is kept, props change). */
    rerender(next: ReactNode) {
      act(() => root.render(next));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/**
 * Types `value` into an <input> or picks it in a <select>, the way a user would, so React's onChange runs.
 * React remembers the last value it set and ignores a plain `input.value = ...`, so the value is written
 * with the browser's own setter and then the matching event is dispatched.
 */
export function setControlValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!;
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

/** Dispatches an event that bubbles (pointerup, keyup...) inside act(). */
export function fire(element: Element, event: Event) {
  act(() => {
    element.dispatchEvent(event);
  });
}

/**
 * jsdom has no <dialog> behaviour: showModal() and close() do nothing. Call this in beforeEach to get the two
 * parts our components rely on: showModal() sets `open`, close() takes it away and fires `close` (as the browser does).
 */
export function polyfillDialog() {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    if (!this.hasAttribute("open")) return;
    this.toggleAttribute("open", false);
    this.dispatchEvent(new Event("close"));
  };
}

/** Presses and releases a key on an element. */
export function pressKey(element: Element, key: string) {
  fire(element, new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  fire(element, new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
}
