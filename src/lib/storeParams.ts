// The Store filters live in the URL (/store?platform=steam&sort=price_asc&page=2), so a page can be
// bookmarked, shared, reloaded and the browser Back button works. These are the pure helpers
// (URL <-> typed object); the React hook that uses them is in useStoreParams.ts.
import { buildProductsQuery, type ProductsParams } from "../api/catalog.ts";
import { SORTS, type Sort } from "../api/types.ts";

/**
 * Everything the Store page keeps in its URL: the listing filters of GET /api/products
 * (without pageSize: the page size is the server default) plus the header's search text `q`.
 */
export type StoreParams = Omit<ProductsParams, "pageSize"> & {
  /** Free-text search typed in the header. The API does not use it yet. */
  q?: string;
};

// The API answers 400 for these limits (pkg/server/catalog_query.go). The page must never send them,
// so the numbers are repeated here and the parser keeps the URL inside them.
export const MAX_PAGE = 10_000;
export const MAX_SLUGS_PER_FILTER = 20;

/** "steam,psn" -> ["steam", "psn"]; empty items and repeats are dropped, at most 20 are kept; nothing left -> undefined. */
function parseList(value: string | null): string[] | undefined {
  const items = [...new Set((value ?? "").split(",").filter((item) => item !== ""))].slice(0, MAX_SLUGS_PER_FILTER);
  return items.length > 0 ? items : undefined;
}

/** "500" -> 500. Anything that is not a plain integer inside [min, max] is ignored. */
function parseInteger(value: string | null, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : undefined;
}

function parseSort(value: string | null): Sort | undefined {
  return SORTS.find((s) => s === value);
}

/**
 * Reads the URL into a typed object. The URL is user input (anyone can type anything), so this is where it is
 * SANITIZED: invalid values are dropped (they fall back to the default), and the rest of the app - and the API
 * request - only ever sees valid ones. The user never gets a 400 page for a hand-typed URL.
 * The server still validates everything too (the API is public; it cannot trust this code).
 */
export function parseStoreParams(search: URLSearchParams): StoreParams {
  const candidate: StoreParams = {
    q: search.get("q")?.trim() || undefined,
    platform: parseList(search.get("platform")),
    region: parseList(search.get("region")),
    minPrice: parseInteger(search.get("minPrice"), 0),
    maxPrice: parseInteger(search.get("maxPrice"), 0),
    sort: parseSort(search.get("sort")),
    page: parseInteger(search.get("page"), 1, MAX_PAGE),
  };
  // A range like minPrice=2000&maxPrice=500 contradicts itself (the API would answer 400): ignore both.
  if (candidate.minPrice !== undefined && candidate.maxPrice !== undefined && candidate.minPrice > candidate.maxPrice) {
    delete candidate.minPrice;
    delete candidate.maxPrice;
  }
  // Keep only the keys that have a value (so `{}` means "no filters" and toEqual is simple).
  return Object.fromEntries(Object.entries(candidate).filter(([, v]) => v !== undefined)) as StoreParams;
}

/**
 * Turns params into a query string ("?q=zelda&platform=steam&page=2" or ""). The filter part is
 * built by buildProductsQuery, so the URL and the API request follow the same rules
 * (fixed order, no empty values, commas between several values). `q` goes first.
 */
export function buildStoreSearch(params: StoreParams): string {
  const { q, ...filters } = params;
  const filterQuery = buildProductsQuery(filters); // "" or "?a=b&c=d"
  const text = q?.trim();
  if (!text) return filterQuery;
  const qPart = `q=${encodeURIComponent(text)}`;
  return filterQuery ? `?${qPart}&${filterQuery.slice(1)}` : `?${qPart}`;
}

/**
 * Applies a change to the current params. A key set to `undefined` is removed.
 * When something other than the page changes (a filter, the sort, the search), the old page number
 * no longer makes sense, so we go back to page 1 - unless the patch sets the page itself.
 */
export function mergeStoreParams(current: StoreParams, patch: Partial<StoreParams>): StoreParams {
  const merged: StoreParams = { ...current, ...patch };
  const changesOnlyPage = Object.keys(patch).every((key) => key === "page");
  if (!changesOnlyPage && !("page" in patch)) delete merged.page;
  return merged;
}
