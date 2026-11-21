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
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}
