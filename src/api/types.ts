// TypeScript types that match the JSON of the Go API exactly (pkg/catalog/types.go).
// Money is always an integer number of CENTS; formatting is the UI's job.
// `null` means "unknown / not available" and is always present in the JSON (never omitted).

/** A platform or a region as shown on cards and in filters. */
export interface Ref {
  slug: string;
  name: string;
}

/** The sorts the Store's sort control offers (and accepts from the URL). */
export const SORTS = ["popularity", "price_asc", "price_desc", "discount", "newest", "title"] as const;
/**
 * Every allowed value of the `sort` query parameter of GET /api/products: the Store's sorts plus
 * "relevance" ("Best match"). The server uses relevance by default when `q` is set; without `q` it
 * is the same order as popularity. It is not in SORTS yet: the search UI (Task 13b) decides where it is offered.
 */
export type Sort = (typeof SORTS)[number] | "relevance";

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

/** One entry of the search-box dropdown: one per GAME, linking to one of its products. */
export interface Suggestion {
  gameTitle: string;
  /** The game's cheapest in-stock product; if none is in stock, its first product (then inStock=false). */
  productSlug: string;
  /** Edition of that product: "Standard" or a special one such as "Game of the Year Edition" (the row shows only the special ones). */
  edition: string;
  /** Platform and region of that product. */
  platform: Ref;
  region: Ref;
  coverUrl: string | null;
  /** Price of that product in cents; null = no product of the game is in stock. */
  priceCents: number | null;
  inStock: boolean;
  /** The alias that matched when the title did not ("GTA 5" for Grand Theft Auto V); null when the title matched. */
  matchedAlias: string | null;
}

/** Response of GET /api/search/suggest?q=…: at most 6 items, best match first; [] when nothing matches. */
export interface SuggestResponse {
  items: Suggestion[];
}

// ---------------------------------------------------------------------------
// Checkout (Task 16a): pkg/orders. Money is integer cents; times are ISO-8601 strings.
// ---------------------------------------------------------------------------

/** What the server found different from what the cart expected, on one line. */
export type LineChange = "price_changed" | "quantity_reduced" | "unavailable";

/** One cart line as the client sends it (POST /api/checkout/quote and POST /api/orders). */
export interface CartLineInput {
  offerId: number;
  quantity: number;
  /** The price the buyer saw. The server only COMPARES it; the buyer is charged the server's price. */
  expectedPriceCents: number;
}

/** One cart line as the server sees it NOW. `quantity` is what can really be bought (0 = nothing). */
export interface CheckoutLine {
  offerId: number;
  quantity: number;
  unitPriceCents: number;
  /** Keys that can be bought now. */
  stock: number;
  /** min(stock, 5): the most the buyer can choose. 0 when unavailable. */
  maxQuantity: number;
  available: boolean;
  productSlug: string;
  title: string;
  edition: string;
  platformName: string;
  regionName: string;
  sellerName: string;
  coverUrl: string | null;
  /** Empty when the line is exactly what the cart expected. */
  changes: LineChange[];
}

/** Response of POST /api/checkout/quote. */
export interface Quote {
  lines: CheckoutLine[];
  totalCents: number;
}

/** Body of the 409 answer of POST /api/orders: nothing was created; every line is listed with its changes. */
export interface CartChangedBody {
  error: "cart_changed";
  lines: CheckoutLine[];
}

export type OrderStatus = "pending" | "paid" | "expired" | "cancelled";

/** One line of an order: a snapshot of what was bought. */
export interface OrderItem {
  offerId: number;
  productSlug: string;
  title: string;
  edition: string;
  platformName: string;
  regionName: string;
  sellerName: string;
  unitPriceCents: number;
  quantity: number;
  /** The key codes: filled ONLY when the order is paid, otherwise []. */
  keys: string[];
}

export interface Order {
  /** A UUID. */
  id: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  /** The keys of a pending order are held until then (15 minutes after creation). */
  reservedUntil: string;
  /** null until paid. */
  paidAt: string | null;
  items: OrderItem[];
}

/** One row of GET /api/orders (newest first). `itemCount` = number of keys in the order. */
export interface OrderSummary {
  id: string;
  status: OrderStatus;
  totalCents: number;
  itemCount: number;
  createdAt: string;
  reservedUntil: string;
}

/** Response of POST /api/orders (201 new, 200 same idempotency key again), pay and cancel. */
export interface OrderResponse {
  order: Order;
}

/** Response of GET /api/orders/{id}. `serverTime` is the server's clock: run the countdown against it, not the browser's. */
export interface OrderDetailResponse {
  order: Order;
  serverTime: string;
}

export interface OrdersResponse {
  orders: OrderSummary[];
}

/** The simulated payment: the buyer chooses the outcome. */
export type PaymentOutcome = "success" | "decline";
