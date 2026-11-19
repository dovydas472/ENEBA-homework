import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "./client.ts";

/** A request slower than this is considered "slow" (e.g. Neon waking up). */
export const SLOW_AFTER_MS = 1_500;

type State<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  slow: boolean;
};

/**
 * GET `path` on mount (and on every retry) and expose its state.
 *
 * `slow` becomes true if the request is still running after SLOW_AFTER_MS, so
 * the UI can say "Waking up the server..." instead of looking frozen.
 * Why a hook (and not part of apiFetch): "slow" is UI state driven by a timer
 * that must be cleaned up with the component; apiFetch stays a plain function.
 */
export function useApi<T>(path: string) {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
    slow: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true, slow: false });

    // Flip `slow` on if we are still loading after the threshold.
    const slowTimer = setTimeout(() => {
      setState((s) => (s.loading ? { ...s, slow: true } : s));
    }, SLOW_AFTER_MS);

    apiFetch<T>(path, { signal: controller.signal })
      .then((data) => setState({ data, error: null, loading: false, slow: false }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return; // unmounted / superseded: ignore
        const error = err instanceof ApiError ? err : new ApiError("network", "Unexpected error");
        setState({ data: null, error, loading: false, slow: false });
      })
      .finally(() => clearTimeout(slowTimer));

    // Cleanup: cancel the request and the timer (unmount, path change, retry).
    return () => {
      controller.abort();
      clearTimeout(slowTimer);
    };
  }, [path, attempt]);

  // Re-run the effect by bumping `attempt`.
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { ...state, retry };
}
