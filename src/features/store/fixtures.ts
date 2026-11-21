// Test data for the Store components (used only by *.test.tsx files).
import type { Facets, ProductItem, ProductsResponse } from "../../api/types.ts";

export function makeItem(overrides: Partial<ProductItem> = {}): ProductItem {
  return {
    slug: "the-witcher-3-wild-hunt-steam-global",
    title: "The Witcher 3: Wild Hunt",
    edition: "Standard",
    platform: { slug: "steam", name: "Steam" },
    region: { slug: "global", name: "Global" },
    coverUrl: "https://images.example/witcher.jpg",
    priceCents: 1099,
    msrpCents: 3999,
    discountPercent: 72,
    offerCount: 3,
    inStock: true,
    ...overrides,
  };
}

export const facets: Facets = {
  platforms: [
    { slug: "steam", name: "Steam", count: 54 },
    { slug: "psn", name: "PlayStation Network", count: 17 },
  ],
  regions: [
    { slug: "global", name: "Global", count: 70 },
    { slug: "europe", name: "Europe", count: 22 },
  ],
  priceRange: { minCents: 549, maxCents: 5099 },
};

/** A listing response. `total` defaults to the number of items. */
export function makeResponse(items: ProductItem[], overrides: Partial<ProductsResponse> = {}): ProductsResponse {
  return { items, total: items.length, page: 1, pageSize: 24, facets, ...overrides };
}
