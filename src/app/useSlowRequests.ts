import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/** A request slower than this is considered "slow" (e.g. Neon or the Vercel function waking up). */
export const SLOW_AFTER_MS = 1_500;

/**
 * True while some API request has been pending for longer than SLOW_AFTER_MS.
 * Used for the global "Waking up the server..." notice.
 *
 * How it works: useIsFetching / useIsMutating count the requests that are running right now
 * (any query or mutation of the QueryClient). While that count is above zero we start ONE timer;
 * when it fires we flip `timerFired`. When the requests finish, the effect cleanup stops the timer
 * and resets the flag. `busy && timerFired` is therefore only true for a slow batch of requests,
 * and a fast request never switches it on.
 * (This is the same idea as `slow` in the old useApi hook, but for ALL requests instead of one.)
 */
export function useSlowRequests(): boolean {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [timerFired, setTimerFired] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setTimerFired(true), SLOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setTimerFired(false);
    };
  }, [busy]);

  return busy && timerFired;
}
