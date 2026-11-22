import { useEffect, useState } from "react";

/**
 * Returns `value`, but only after it has stopped changing for `delayMs`.
 * Typing "witcher" quickly gives ONE change ("witcher") instead of seven ("w", "wi", "wit"…), so the search
 * suggestions send one request instead of one per key. Every new value restarts the timer (the cleanup clears
 * the old one).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
