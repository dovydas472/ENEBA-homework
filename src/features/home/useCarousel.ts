import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion.ts";

/** How long a slide stays before the next one (owner decision: about 6 s). */
export const AUTOPLAY_MS = 6000;

/** A finger must move at least this far sideways for a swipe (a small wobble while tapping a button is not one). */
export const SWIPE_MIN_PX = 40;

/**
 * Task 17: what a finger movement means. A swipe is mostly HORIZONTAL (more sideways than up/down) and long enough;
 * to the left shows the next slide, to the right the previous one (the content follows the finger).
 * Anything else - a tap, a short wobble, a vertical scroll - is not a swipe (null).
 */
export function swipeDirection(dx: number, dy: number): "next" | "prev" | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? "next" : "prev";
}

/**
 * The state of the hero carousel (WAI-ARIA "carousel" pattern):
 *  - `index`: the slide on screen. next / prev wrap around; goTo jumps.
 *  - `playing`: the automatic slide show is ON (what the Play / Pause button shows). It starts ON, except when the
 *    user asked the system to reduce motion - then it starts OFF, and only the user can switch it on.
 *  - `rotating`: the slides are moving RIGHT NOW = playing, more than one slide, and the pointer is not over the
 *    carousel and keyboard focus is not inside it (nobody wants a slide to change while they read it or are about
 *    to click its button).
 * `rootProps` go on the carousel's outer element (hover / focus pause, arrow keys, and the touch swipe of Task 17).
 */
export function useCarousel(count: number) {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  // null = the user has not pressed Play / Pause yet, so the default (from reduced motion) applies.
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Where the finger went down (null = no swipe in progress). A ref: it changes nothing on screen.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // A refetch may return fewer slides: never point past the end.
  const current = count > 0 ? Math.min(index, count - 1) : 0;
  const playing = count > 1 && (userPlaying ?? !reducedMotion);
  const rotating = playing && !hovered && !focused;

  // One timer per shown slide: any change of slide (automatic or by the user) starts a fresh 6 s.
  useEffect(() => {
    if (!rotating) return;
    const timer = setTimeout(() => setIndex((current + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [rotating, current, count]);

  const goTo = (i: number) => setIndex(((i % count) + count) % count);
  const next = () => goTo(current + 1);
  const prev = () => goTo(current - 1);

  return {
    index: current,
    playing,
    rotating,
    goTo,
    next,
    prev,
    togglePlaying: () => setUserPlaying(!playing),
    rootProps: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      // Focus moving between two buttons INSIDE the carousel is not "leaving" it.
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      },
      // Swipe on touch screens (Task 17). Plain pointer events, no library. CSS `touch-action: pan-y` on the carousel
      // lets the BROWSER keep vertical scrolling (the page scrolls as usual) and hands sideways movement to us.
      // When the browser does take over (a scroll started), it sends pointercancel and the swipe is forgotten.
      // A mouse is left out: dragging with a mouse selects text, and desktop has the arrow buttons.
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        swipeStart.current = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start || count < 2) return;
        const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
        if (direction === "next") next();
        else if (direction === "prev") prev();
      },
      onPointerCancel: () => {
        swipeStart.current = null;
      },
      // Left / Right arrow keys anywhere inside the carousel change the slide.
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (count < 2) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          prev();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          next();
        }
      },
    },
  };
}
