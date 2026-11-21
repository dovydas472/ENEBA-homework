import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "./client.ts";

/** A request slower than this is considered "slow" (e.g. Neon waking up). */
export const SLOW_AFTER_MS = 1_500;

/** The outcome of one finished request, tagged with the request it belongs to. */
type Result<T> = {
  requestId: string;
  data: T | null;
  error: ApiError | null;
};

/**
 * GET `path` on mount (and on every retry) and expose its state.
 *
 * `slow` becomes true if the request is still running after SLOW_AFTER_MS, so
 * the UI can say "Waking up the server..." instead of looking frozen.
 * Why a hook (and not part of apiFetch): "slow" is UI state driven by a timer
 * that must be cleaned up with the component; apiFetch stays a plain function.
 *
 * How the state works: every request has an id (path + retry counter). A finished
 * result and the "slow" flag are both stored together with the id of the request
 * they belong to. If the id of the stored result is not the id of the CURRENT
 * request, we are loading. So a new path or a retry is "loading, not slow"
 * immediately, without resetting state inside the effect (React's lint rule
 * `react-hooks/set-state-in-effect` forbids that: it causes an extra render).
 */
export function useApi<T>(path: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const [slowRequestId, setSlowRequestId] = useState<string | null>(null);

  const requestId = `${attempt}:${path}`;
  const loading = result?.requestId !== requestId;

  useEffect(() => {
    const controller = new AbortController();

    // Flip `slow` on if we are still loading after the threshold.
    const slowTimer = setTimeout(() => setSlowRequestId(requestId), SLOW_AFTER_MS);

    apiFetch<T>(path, { signal: controller.signal })
      .then((data) => setResult({ requestId, data, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return; // unmounted / superseded: ignore
        const error = err instanceof ApiError ? err : new ApiError("network", "Unexpected error");
        setResult({ requestId, data: null, error });
      })
      .finally(() => clearTimeout(slowTimer));

    // Cleanup: cancel the request and the timer (unmount, path change, retry).
    return () => {
      controller.abort();
      clearTimeout(slowTimer);
    };
  }, [path, requestId]);

  // Re-run the effect by bumping `attempt`.
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return {
    data: loading ? null : result.data,
    error: loading ? null : result.error,
    loading,
    slow: loading && slowRequestId === requestId,
    retry,
  };
}
