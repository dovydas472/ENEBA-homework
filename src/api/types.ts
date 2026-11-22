// TypeScript types that match the JSON of the Go API exactly (pkg/catalog/types.go).
// Money is always an integer number of CENTS; formatting is the UI's job.
// `null` means "unknown / not available" and is always present in the JSON (never omitted).

/** A platform or a region as shown on cards and in filters. */
export interface Ref {
  slug: string;
  name: string;
}

/** The allowed values of the `sort` query parameter of GET /api/products. */
export const SORTS = ["popularity", "price_asc", "price_desc", "discount", "newest", "title"] as const;
export type Sort = (typeof SORTS)[number];

/** One product card in the listing. */
export interface ProductItem {
  slug: string;
  title: string;
  edition: string;
  platform: Ref;
  region: Ref;
  coverUrl: string | null;
  /** Cheapest buyable offer in cents; null = out of stock. */
  priceCents: number | null;
  /** Original price in cents; null = unknown. */
  msrpCents: number | null;
  /** Whole percent, rounded down; null = unknown or no real discount. */
  discountPercent: number | null;
  /** Offers that can be bought now. */
  offerCount: number;
  inStock: boolean;
  /** The offer a card's "Add to cart" adds = the first offer of the product page; null = out of stock. */
  cheapestOffer: CheapestOffer | null;
}

/** What the cart needs from the cheapest buyable offer of a listing item (its price is the item's priceCents). */
export interface CheapestOffer {
  offerId: number;
  stock: number;
  sellerName: string;
}

/** One entry of a filter group, with the number of matching products. */
export interface FacetOption {
  slug: string;
  name: string;
  count: number;
}

export interface PriceRange {
  minCents: number;
  maxCents: number;
}

/**
 * Filter options for the CURRENT result. Each group is counted with all the other
 * active filters applied except its own. Entries with count 0 appear only when selected.
 */
export interface Facets {
  platforms: FacetOption[];
  regions: FacetOption[];
  /** Over in-stock products matching platform/region (ignores the price filter); null = none in stock. */
  priceRange: PriceRange | null;
}

/** Response of GET /api/products. */
export interface ProductsResponse {
  items: ProductItem[];
  /** All matching products, not only this page. */
  total: number;
  page: number;
  pageSize: number;
  facets: Facets;
}

export interface Seller {
  slug: string;
  name: string;
  /** 0-10; null = new seller without a rating. */
  rating: number | null;
  ratingLabel: "Superb" | "Excellent" | "Very good" | "Good" | null;
  isNew: boolean;
  reviewsCount: number;
}

/** A buyable offer (active and in stock). */
export interface Offer {
  offerId: number;
  priceCents: number;
  stock: number;
  seller: Seller;
}

export interface ProductInfo {
  slug: string;
  edition: string;
  platform: Ref;
  region: Ref;
  msrpCents: number | null;
  /** Cheapest buyable offer; null = out of stock. */
  priceCents: number | null;
  inStock: boolean;
}

export interface GameInfo {
  title: string;
  /** Empty string = no description. */
  description: string;
  genres: string[];
  /** "YYYY-MM-DD"; null = unknown. */
  releaseDate: string | null;
  developer: string | null;
  publisher: string | null;
  coverUrl: string | null;
}

/** Another product of the same game ("other versions"). */
export interface Variant {
  slug: string;
  edition: string;
  platform: Ref;
  region: Ref;
  priceCents: number | null;
  inStock: boolean;
}

/** Response of GET /api/products/{slug}. */
export interface ProductDetail {
  product: ProductInfo;
  game: GameInfo;
  /** Cheapest first; empty when out of stock. */
  offers: Offer[];
  variants: Variant[];
}
