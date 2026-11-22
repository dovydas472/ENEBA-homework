// The Store filters live in the URL (/store?platform=steam&sort=price_asc&page=2), so a page can be
// bookmarked, shared, reloaded and the browser Back button works. These are the pure helpers
// (URL <-> typed object); the React hook that uses them is in useStoreParams.ts.
import { buildProductsQuery, type ProductsParams } from "../api/catalog.ts";
import { SORTS, type Sort } from "../api/types.ts";

/**
 * Everything the Store page keeps in its URL: the parameters of GET /api/products, including the header's
 * search text `q` (without pageSize: the page size is the server default).
 */
export type StoreParams = Omit<ProductsParams, "pageSize">;

// The API answers 400 for these limits (pkg/server/catalog_query.go). The page must never send them,
// so the numbers are repeated here and the parser keeps the URL inside them.
export const MAX_PAGE = 10_000;
export const MAX_SLUGS_PER_FILTER = 20;
/** Search text length limits of the API (after trimming), counted in characters. */
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

/**
 * The search text as the API accepts it: trimmed, 2-100 characters. Shorter -> undefined (no search);
 * longer -> cut to 100. Characters are counted as code points ([...text]), so an emoji counts as one
 * and is never cut in half.
 */
export function cleanQuery(value: string | null | undefined): string | undefined {
  // Cut first, then trim: the cut can leave spaces at the end ("a" + 99 spaces + "b" -> "a").
  const text = [...(value ?? "").trim()].slice(0, MAX_QUERY_LENGTH).join("").trimEnd();
  return [...text].length >= MIN_QUERY_LENGTH ? text : undefined;
}

/**
 * "Best match" (sort=relevance) only means something while there is a search text. Without `q` the sort is
 * dropped, so the page falls back to its default (Most popular). Used when reading the URL AND when writing it.
 */
function withoutOrphanRelevance(params: StoreParams): StoreParams {
  if (params.sort !== "relevance" || params.q) return params;
  const rest = { ...params };
  delete rest.sort;
  return rest;
}

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
    q: cleanQuery(search.get("q")),
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
  const params = Object.fromEntries(Object.entries(candidate).filter(([, v]) => v !== undefined)) as StoreParams;
  return withoutOrphanRelevance(params);
}

/**
 * Turns params into a query string ("?q=zelda&platform=steam&page=2" or ""). It is buildProductsQuery itself,
 * so the URL and the API request follow the same rules (fixed order with `q` first, no empty values,
 * commas between several values). A blank search text is left out.
 */
export function buildStoreSearch(params: StoreParams): string {
  return buildProductsQuery({ ...params, q: params.q?.trim() });
}

/**
 * Applies a change to the current params. A key set to `undefined` is removed.
 * When something other than the page changes (a filter, the sort, the search), the old page number
 * no longer makes sense, so we go back to page 1 - unless the patch sets the page itself.
 * Removing the search text also removes "Best match" (see withoutOrphanRelevance), so the URL stays clean.
 */
export function mergeStoreParams(current: StoreParams, patch: Partial<StoreParams>): StoreParams {
  const merged: StoreParams = { ...current, ...patch };
  const changesOnlyPage = Object.keys(patch).every((key) => key === "page");
  if (!changesOnlyPage && !("page" in patch)) delete merged.page;
  return withoutOrphanRelevance(merged);
}
