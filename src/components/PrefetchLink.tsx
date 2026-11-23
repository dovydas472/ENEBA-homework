import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type ComponentProps } from "react";
import { Link } from "react-router";
import { HOVER_DELAY_MS, prefetchRoute } from "../app/prefetch.ts";

export type PrefetchLinkProps = ComponentProps<typeof Link>;

/**
 * The app's internal link (Task 17): a normal React Router <Link> that starts loading the target page when the user
 * shows the intent to open it (see src/app/prefetch.ts for WHAT is loaded):
 *  - pointer resting on it for HOVER_DELAY_MS (80 ms) - leaving earlier cancels, so sweeping the mouse across a grid
 *    of cards does not fire a request per card;
 *  - keyboard focus - Tab reaching a link is a strong sign, so no delay;
 *  - touchstart - phones have no hover; the finger touches ~100 ms before the click fires, enough to start early.
 * Every handler the caller passes (onMouseEnter, onFocus...) still runs.
 */
export function PrefetchLink({ to, onMouseEnter, onMouseLeave, onFocus, onTouchStart, ...rest }: PrefetchLinkProps) {
  const queryClient = useQueryClient();
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A link that disappears while the pointer is on it must not prefetch afterwards.
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const prefetch = () => prefetchRoute(queryClient, to);

  return (
    <Link
      {...rest}
      to={to}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(prefetch, HOVER_DELAY_MS);
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        clearTimeout(hoverTimer.current);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        prefetch();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        prefetch();
      }}
    />
  );
}
