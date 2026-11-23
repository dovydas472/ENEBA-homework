// Prefetch on intent (Task 17): when the user is ABOUT to open a page (pointer resting on a link, keyboard focus on it,
// finger touching it), start downloading what that page needs. By the time the click lands, the data is usually in the
// TanStack Query cache and the page's code is loaded, so the page opens with no loading state at all.
//
// This file decides WHAT to prefetch for a link target (planPrefetch, a pure function) and does it (prefetchRoute).
// WHEN is decided by PrefetchLink (src/components/PrefetchLink.tsx).
import type { QueryClient } from "@tanstack/react-query";
import { matchPath, type To } from "react-router";
import { homepageQuery, orderListQuery, productListQuery, productQuery, queryKeys } from "../api/queries.ts";
import { parseStoreParams, type StoreParams } from "../lib/storeParams.ts";
import { pageLoaders, type LazyPage } from "./lazyPages.ts";

/** How long the pointer must rest on a link before it counts as intent (a pointer passing over it costs nothing). */
export const HOVER_DELAY_MS = 80;

/**
 * A prefetched answer counts as fresh this long: within it, hovering the same link again sends no request.
 * It is the app's default staleTime (queryClient.ts). The order list's own staleTime is 0 (statuses change), so without
 * this every hover over "My orders" would ask again; its page still refreshes the list when it opens.
 */
export const PREFETCH_FRESH_MS = 30_000;

/** The data a page shows first, as plain data (easy to test); prefetchRoute turns it into the page's own query. */
export type PrefetchData =
  | { kind: "homepage" }
  | { kind: "product"; slug: string }
  | { kind: "products"; params: StoreParams }
  | { kind: "orders" };

export interface PrefetchPlan {
  /** The lazily loaded page whose code to download (lazyPages.ts); none for the pages in the main bundle. */
  page?: LazyPage;
  data?: PrefetchData;
}

/** Splits a link target into path + query string. Only this app's own paths ("/...") are prefetched. */
function splitTarget(to: To): { pathname: string; search: string } | null {
  if (typeof to === "string") {
    // "//host/x" would be another site; anything not starting with "/" is relative or external.
    if (!to.startsWith("/") || to.startsWith("//")) return null;
    const url = new URL(to, "http://app.invalid"); // the base only lets URL parse a path; it is never used
    return { pathname: url.pathname, search: url.search };
  }
  if (!to.pathname?.startsWith("/")) return null;
  return { pathname: to.pathname, search: to.search ?? "" };
}

/**
 * What the page at `to` needs, or null for "nothing" (unknown target, another site).
 *   /                   -> the home page's block registry (each block then loads its own content)
 *   /product/:slug      -> the product query (Product is in the main bundle: no code to load)
 *   /store?...          -> the listing query with the URL's filters, read by the SAME sanitizer as the Store page
 *                          (parseStoreParams), so the cache key is exactly the one the page will ask for
 *   /orders             -> its code + the order list (the list only when signed in - see prefetchRoute)
 *   /orders/:id, /checkout/:orderId, /cart, /login, /register -> their code only
 */
export function planPrefetch(to: To): PrefetchPlan | null {
  const target = splitTarget(to);
  if (!target) return null;
  const { pathname, search } = target;

  if (pathname === "/") return { data: { kind: "homepage" } };
  const product = matchPath("/product/:slug", pathname);
  if (product?.params.slug) return { data: { kind: "product", slug: product.params.slug } };
  if (matchPath("/store", pathname)) return { data: { kind: "products", params: parseStoreParams(new URLSearchParams(search)) } };
  if (matchPath("/orders", pathname)) return { page: "orders", data: { kind: "orders" } };
  if (matchPath("/orders/:id", pathname)) return { page: "order" };
  if (matchPath("/checkout/:orderId", pathname)) return { page: "checkout" };
  if (matchPath("/cart", pathname)) return { page: "cart" };
  if (matchPath("/login", pathname)) return { page: "login" };
  if (matchPath("/register", pathname)) return { page: "register" };
  return null;
}

/** The visitor asked the browser to use less data ("Lite mode", Data Saver): then nothing is fetched early. */
export function saveDataOn(): boolean {
  // navigator.connection is not in every browser (nor in TypeScript's DOM types), hence the optional chain.
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * Starts the downloads the page at `to` needs. Safe to call often:
 *  - prefetchQuery does nothing while the cached answer is fresh (PREFETCH_FRESH_MS) or already on its way;
 *  - a page's code is loaded once; calling its loader again returns the same module.
 * Nothing here ever throws or shows an error: a failed prefetch is simply ignored, and the page asks again itself
 * (with its own loading and error states) when it opens.
 */
export function prefetchRoute(queryClient: QueryClient, to: To): void {
  if (saveDataOn()) return;
  const plan = planPrefetch(to);
  if (!plan) return;

  if (plan.page) {
    pageLoaders[plan.page]().catch(() => {}); // a failed download is retried by the real navigation
  }

  const data = plan.data;
  if (!data) return;
  const fresh = { staleTime: PREFETCH_FRESH_MS };
  switch (data.kind) {
    case "homepage":
      void queryClient.prefetchQuery({ ...homepageQuery(), ...fresh });
      return;
    case "product":
      void queryClient.prefetchQuery({ ...productQuery(data.slug), ...fresh });
      return;
    case "products":
      void queryClient.prefetchQuery({ ...productListQuery(data.params), ...fresh });
      return;
    case "orders":
      // Orders belong to the signed-in user. Signed out (or not known yet) the server would only answer 401.
      if (queryClient.getQueryData(queryKeys.currentUser)) {
        void queryClient.prefetchQuery({ ...orderListQuery(), ...fresh });
      }
      return;
  }
}
