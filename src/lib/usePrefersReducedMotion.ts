import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** The media query list, or null where matchMedia does not exist (old browsers, some test environments). */
function mediaQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
}

function subscribe(onChange: () => void) {
  const mql = mediaQuery();
  mql?.addEventListener("change", onChange);
  return () => mql?.removeEventListener("change", onChange);
}

/**
 * True when the user asked the operating system to reduce motion. useSyncExternalStore keeps it LIVE:
 * switching the setting while the page is open updates every component that uses it.
 * CSS animations are already switched off globally (global.css); this is for motion started by JavaScript,
 * like the hero carousel's autoplay.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => mediaQuery()?.matches ?? false);
}
