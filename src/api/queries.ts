// Query keys and query functions in ONE place. TanStack Query caches every answer under its key, so the
// Store page (useQuery) and the card hover prefetch (queryClient.prefetchQuery) must use the SAME key
// for the SAME data - that is why both call these helpers instead of writing keys by hand.
import { queryOptions } from "@tanstack/react-query";
import { getCurrentUser } from "./auth.ts";
import { getProduct, getProducts, getSuggestions, type ProductsParams } from "./catalog.ts";
import { getBlock, getHomepage } from "./homepage.ts";
import { getOrder, listOrders } from "./orders.ts";
import type { CartLineInput } from "./types.ts";

/** The first part of every key: `invalidateQueries({ queryKey: queryKeys.products })` would reset all listings. */
export const queryKeys = {
  /** Task 16b: every order key starts with "orders", so sign in / out can drop them all at once (they belong to one user). */
  orders: ["orders"] as const,
  orderList: ["orders", "list"] as const,
  order: (id: string) => ["orders", "detail", id] as const,
  /** The cart's price/stock check (useCartQuote): the key is the exact lines sent, so a changed cart is a new question. */
  cartQuote: (items: CartLineInput[]) => ["cartQuote", items] as const,
  products: ["products"] as const,
  /** One listing: the key contains the filters, so every filter combination has its own cache entry. */
  productList: (params: ProductsParams) => ["products", params] as const,
  /** One product page (Task 12 uses it; the Store card prefetches it on hover). */
  product: (slug: string) => ["product", slug] as const,
  /** Header search suggestions for one search text: every text has its own cache entry. */
  suggestions: (q: string) => ["suggestions", q] as const,
  /** Who is signed in (Task 14): the user or null. Sign in / out write this entry directly. */
  currentUser: ["auth", "me"] as const,
  /** The home page block registry (Task 15). */
  homepage: ["homepage"] as const,
  /** One home page block's content, keyed by its endpoint: every block is cached (and retried) on its own. */
  homeBlock: (endpoint: string) => ["homepage", "block", endpoint] as const,
};

/** Key + function of the home page registry (GET /api/homepage). */
export function homepageQuery() {
  return queryOptions({
    queryKey: queryKeys.homepage,
    queryFn: ({ signal }) => getHomepage({ signal }),
  });
}

/**
 * Key + function of one block. T is the block's JSON shape (HeroBlockData, ...): the renderer that asks for it
 * knows which type it draws. Each block is its own query, so one slow or failing block never holds up the others.
 */
export function homeBlockQuery<T>(endpoint: string) {
  return queryOptions({
    queryKey: queryKeys.homeBlock(endpoint),
    queryFn: ({ signal }) => getBlock<T>(endpoint, { signal }),
  });
}

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

/**
 * Key + function of "who is signed in" (GET /api/auth/me): the user, or null when signed out.
 * staleTime 5 minutes: the answer only changes when THIS app signs in or out, and those actions write the
 * new value into the cache themselves (useAuthMutations), so there is no need to ask the server often.
 */
export function currentUserQuery() {
  return queryOptions({
    queryKey: queryKeys.currentUser,
    queryFn: ({ signal }) => getCurrentUser({ signal }),
    staleTime: 5 * 60_000,
  });
}

/** Key + function of the signed-in user's order list. staleTime 0: statuses change (paid, expired). */
export function orderListQuery() {
  return queryOptions({
    queryKey: queryKeys.orderList,
    queryFn: ({ signal }) => listOrders({ signal }),
    staleTime: 0,
  });
}

/** Key + function of one order (payment page and order page). staleTime 0: the status and the server time must be fresh. */
export function orderQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.order(id),
    queryFn: ({ signal }) => getOrder(id, { signal }),
    staleTime: 0,
  });
}
