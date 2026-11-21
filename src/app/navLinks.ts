import { buildStoreSearch } from "../lib/storeParams.ts";

/** One entry of the main navigation. */
export interface NavLinkItem {
  label: string;
  /** Path + query string, e.g. "/store?platform=steam". */
  to: string;
}

/** "/store" + the query string of a platform filter, built by the same helper the Store page uses. */
function platformLink(slug: string): string {
  return `/store${buildStoreSearch({ platform: [slug] })}`;
}

/**
 * The main navigation (Task 11b): the desktop strip under the header and the phone menu show this same list.
 * Only links that work: the Store and four platform shortcuts. The slugs are the ones in the database
 * (GET /api/products facets); a slug the catalog does not know would simply show "no results".
 */
export const NAV_LINKS: NavLinkItem[] = [
  { label: "Store", to: "/store" },
  { label: "Steam", to: platformLink("steam") },
  { label: "PSN", to: platformLink("psn") },
  { label: "Xbox Live", to: platformLink("xbox-live") },
  { label: "Nintendo eShop", to: platformLink("nintendo-eshop") },
];
