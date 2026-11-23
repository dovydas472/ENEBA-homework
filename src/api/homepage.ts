// Typed functions for the home page endpoints (Task 15). Every call goes through apiFetch.
import { apiFetch, type ApiOptions } from "./client.ts";
import type { HomepageResponse } from "./types.ts";

/** GET /api/homepage: which blocks the home page shows, in order, and where each one's content is. */
export function getHomepage(options?: ApiOptions): Promise<HomepageResponse> {
  return apiFetch<HomepageResponse>("/api/homepage", options);
}

/** Every block endpoint lives under this path (the server builds them in pkg/homepage/config.go). */
export const BLOCK_ENDPOINT_PREFIX = "/api/blocks/";

/**
 * GET one block's content from the endpoint the registry gave. The page only ever asks OUR block API:
 * an endpoint outside /api/blocks/ (which our server never sends) is refused instead of fetched,
 * and the block shows its error state.
 */
export function getBlock<T>(endpoint: string, options?: ApiOptions): Promise<T> {
  if (!endpoint.startsWith(BLOCK_ENDPOINT_PREFIX) || endpoint.includes("..")) {
    return Promise.reject(new Error(`Refusing to load a block from ${endpoint}`));
  }
  return apiFetch<T>(endpoint, options);
}
