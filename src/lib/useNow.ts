import { useEffect, useState } from "react";

/**
 * The current time (Date.now()), updated every `intervalMs`: the component re-renders on every tick.
 * Used by the payment page countdown. The interval is cleared when the component goes away.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
