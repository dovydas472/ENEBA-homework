// Typed functions for the catalog endpoints. Every call goes through apiFetch
// (timeout, typed errors), never through a raw fetch.
import { apiFetch, type ApiOptions } from "./client.ts";
import type { ProductDetail, ProductsResponse, Sort } from "./types.ts";

/** The query parameters of GET /api/products. Anything left out (or empty) is not sent. */
export interface ProductsParams {
  /** Platform slugs, e.g. ["steam", "psn"] (multi-select). */
  platform?: string[];
  /** Region slugs (multi-select). */
  region?: string[];
  /** Integer cents >= 0. */
  minPrice?: number;
  maxPrice?: number;
  sort?: Sort;
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

/** A value that means "not set": it is left out of the URL. */
function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/**
 * Turns params into a query string ("?platform=steam,psn&sort=price_asc"), or ""
 * when nothing is set.
 * - empty values are omitted (the server treats a missing parameter as "no filter"),
 * - 0 is kept (minPrice=0 is a real value),
 * - several values are joined with commas (each one encoded, the commas stay readable),
 * - the order is fixed, so the same filters always give the same URL (better CDN cache hits).
 */
export function buildProductsQuery(params: ProductsParams): string {
  const order = ["platform", "region", "minPrice", "maxPrice", "sort", "page", "pageSize"] as const;
  const parts: string[] = [];
  for (const key of order) {
    const raw = params[key];
    // Drop empty slugs first, so a list like [""] counts as empty too.
    const value = Array.isArray(raw) ? raw.filter((v) => v !== "") : raw;
    if (isEmpty(value)) continue;
    const text = Array.isArray(value) ? value.map(encodeURIComponent).join(",") : encodeURIComponent(String(value));
    parts.push(`${key}=${text}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/** GET /api/products: one page of the listing + the facets for the same filters. */
export function getProducts(params: ProductsParams = {}, options?: ApiOptions): Promise<ProductsResponse> {
  return apiFetch<ProductsResponse>(`/api/products${buildProductsQuery(params)}`, options);
}

/** GET /api/products/{slug}: product page data (rejects with ApiError status 404 for an unknown slug). */
export function getProduct(slug: string, options?: ApiOptions): Promise<ProductDetail> {
  return apiFetch<ProductDetail>(`/api/products/${encodeURIComponent(slug)}`, options);
}
