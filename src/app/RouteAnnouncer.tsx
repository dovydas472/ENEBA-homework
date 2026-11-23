import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { VisuallyHidden } from "../components/VisuallyHidden.tsx";

/**
 * SPA accessibility (Task 17). In a normal website every click loads a new document: the browser puts the focus at
 * the top and a screen reader reads the new title. A single-page app only swaps part of the page, so by default the
 * focus stays on the clicked link (which may not exist any more) and nothing is announced. This component does what
 * the browser would do, after every change of PATH:
 *  - moves the focus to the new page's <h1> (or to <main> if the page has none yet, e.g. while it loads), so the next
 *    Tab continues from the page content and a screen reader starts reading there;
 *  - announces the new document title in a polite live region ("Cart – EneHomeworkBa").
 * Only the path counts: a Store filter changes the query string, and the focus must stay on the checkbox then.
 * The first render is skipped (on a fresh load the browser already does the right thing).
 * `preventScroll`: the scroll position is ScrollRestoration's job (Back returns to the same place in the list).
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const [announcement, setAnnouncement] = useState("");
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current === pathname) return; // first render, or the same path again
    previousPath.current = pathname;
    // One frame later: the new page has painted and its own effect has set document.title.
    const frame = requestAnimationFrame(() => {
      const main = document.getElementById("main");
      const target = main?.querySelector<HTMLElement>("h1") ?? main;
      if (target) {
        // A heading is not focusable by itself; tabindex -1 makes it focusable by script only (not by Tab).
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
      setAnnouncement(document.title);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <div aria-live="polite" aria-atomic="true">
      <VisuallyHidden>{announcement}</VisuallyHidden>
    </div>
  );
}
