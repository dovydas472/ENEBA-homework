import { useEffect, useRef, useState } from "react";

/**
 * Is the element on screen? Used by the phone "Add to cart" bar: it appears only once the buy box has been
 * scrolled away, so the two buttons are never visible at the same time.
 * IntersectionObserver tells us when the element enters or leaves the viewport (no scroll listener, no layout
 * reads on every scroll). Starts as `true` (the buy box is near the top), so the bar does not flash on load.
 * Without IntersectionObserver (very old browsers, the test environment) it reports `false`: the bar just stays.
 */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const supported = typeof IntersectionObserver !== "undefined";
  const [inView, setInView] = useState(supported);

  useEffect(() => {
    const element = ref.current;
    if (!element || !supported) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [supported]);

  return { ref, inView };
}
