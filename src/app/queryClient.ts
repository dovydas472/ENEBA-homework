// One QueryClient for the whole app = one cache. TanStack Query keeps every server response in it,
// so a page that was already visited can show its data immediately (no empty flash).
// All requests inside it still go through apiFetch (src/api/client.ts), never through a raw fetch.
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client.ts";

/**
 * Retry rule: ask again ONCE, and only when asking again can help.
 * - network error / 5xx: the server may just be waking up (Neon, cold start) -> retry once.
 * - 4xx (404, 400...): the answer would be the same -> do not retry.
 * - timeout: the user already waited 15 s; retrying would double that -> do not retry.
 * - anything else (parse error, a bug in our code): retrying does not help.
 * `failureCount` is 0 after the first failure.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (!(error instanceof ApiError)) return false;
  if (error.code === "network") return true;
  return error.code === "http" && error.status >= 500;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // staleTime: for 30 s a cached answer counts as fresh. Going back to the Store (or a product)
        // shows the cached data instantly and does NOT refetch. After 30 s it is still shown at once,
        // and silently refreshed in the background. Game data and prices change slowly, so 30 s is safe.
        staleTime: 30_000,
        // retry: see shouldRetry above.
        retry: shouldRetry,
        // refetchOnWindowFocus: by default every click back into the tab refetches. For this demo that
        // would only cause flicker and needless requests (and a "waking up" notice), so it is off.
        refetchOnWindowFocus: false,
      },
    },
  });
}
