// Query keys and query functions in ONE place. TanStack Query caches every answer under its key, so the
// Store page (useQuery) and the card hover prefetch (queryClient.prefetchQuery) must use the SAME key
// for the SAME data - that is why both call these helpers instead of writing keys by hand.
import { queryOptions } from "@tanstack/react-query";
import { getProduct, getProducts, getSuggestions, type ProductsParams } from "./catalog.ts";

/** The first part of every key: `invalidateQueries({ queryKey: queryKeys.products })` would reset all listings. */
export const queryKeys = {
  products: ["products"] as const,
  /** One listing: the key contains the filters, so every filter combination has its own cache entry. */
  productList: (params: ProductsParams) => ["products", params] as const,
  /** One product page (Task 12 uses it; the Store card prefetches it on hover). */
  product: (slug: string) => ["product", slug] as const,
  /** Header search suggestions for one search text: every text has its own cache entry. */
  suggestions: (q: string) => ["suggestions", q] as const,
};

/** Key + function of the listing. `signal` lets TanStack Query cancel the request when it is no longer needed. */
export function productListQuery(params: ProductsParams) {
  return queryOptions({
    queryKey: queryKeys.productList(params),
    queryFn: ({ signal }) => getProducts(params, { signal }),
  });
}

/** Key + function of one product page. */
export function productQuery(slug: string) {
  return queryOptions({
    queryKey: queryKeys.product(slug),
    queryFn: ({ signal }) => getProduct(slug, { signal }),
  });
}

/**
 * Key + function of the header search suggestions. Each text has its own key, so an answer can only ever be shown
 * for the text it was asked for: a slow answer for "wit" can never overwrite the list of "witcher".
 * When the text changes, the old query loses its last observer and TanStack Query aborts its request through `signal`.
 */
export function suggestionsQuery(q: string) {
  return queryOptions({
    queryKey: queryKeys.suggestions(q),
    queryFn: ({ signal }) => getSuggestions(q, { signal }),
  });
}
