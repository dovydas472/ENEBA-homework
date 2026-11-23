import { useEffect, useState, type FocusEvent, type KeyboardEvent } from "react";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion.ts";

/** How long a slide stays before the next one (owner decision: about 6 s). */
export const AUTOPLAY_MS = 6000;

/**
 * The state of the hero carousel (WAI-ARIA "carousel" pattern):
 *  - `index`: the slide on screen. next / prev wrap around; goTo jumps.
 *  - `playing`: the automatic slide show is ON (what the Play / Pause button shows). It starts ON, except when the
 *    user asked the system to reduce motion - then it starts OFF, and only the user can switch it on.
 *  - `rotating`: the slides are moving RIGHT NOW = playing, more than one slide, and the pointer is not over the
 *    carousel and keyboard focus is not inside it (nobody wants a slide to change while they read it or are about
 *    to click its button).
 * `rootProps` go on the carousel's outer element.
 */
export function useCarousel(count: number) {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  // null = the user has not pressed Play / Pause yet, so the default (from reduced motion) applies.
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

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
