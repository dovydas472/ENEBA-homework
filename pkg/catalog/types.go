package catalog

import "errors"

// ErrNotFound is returned by GetProduct when no product has the given slug.
var ErrNotFound = errors.New("catalog: product not found")

// Sort is one of the allowed listing orders. The SQL for each one is a fixed
// line in store.go (orderBy): user text never reaches ORDER BY.
type Sort string

const (
	SortPopularity Sort = "popularity" // default
	SortPriceAsc   Sort = "price_asc"
	SortPriceDesc  Sort = "price_desc"
	SortDiscount   Sort = "discount"
	SortNewest     Sort = "newest"
	SortTitle      Sort = "title"
)

// Sorts lists every valid Sort (used for validation and error messages).
var Sorts = []Sort{SortPopularity, SortPriceAsc, SortPriceDesc, SortDiscount, SortNewest, SortTitle}

// Paging limits (decided by the owner).
const (
	DefaultPageSize = 24
	MaxPageSize     = 48
)

// Filter is a validated listing request. Empty Platforms/Regions = no filter.
// Prices are integer cents; nil = no bound. The HTTP layer validates the
// values (see pkg/server) - the store trusts them except for Sort.
type Filter struct {
	Platforms []string // platform slugs, any of them matches
	Regions   []string // region slugs, any of them matches
	MinPrice  *int64
	MaxPrice  *int64
	Sort      Sort
	Page      int // 1-based
	PageSize  int
}

// Ref is a platform or region as shown on cards and in filters.
type Ref struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// Item is one product card in the listing.
type Item struct {
	Slug            string  `json:"slug"`
	Title           string  `json:"title"`
	Edition         string  `json:"edition"`
	Platform        Ref     `json:"platform"`
	Region          Ref     `json:"region"`
	CoverURL        *string `json:"coverUrl"`        // null = no cover
	PriceCents      *int64  `json:"priceCents"`      // cheapest buyable offer; null = out of stock
	MSRPCents       *int64  `json:"msrpCents"`       // null = unknown
	DiscountPercent *int64  `json:"discountPercent"` // null = unknown / no real discount
	OfferCount      int64   `json:"offerCount"`      // offers that can be bought now
	InStock         bool    `json:"inStock"`
	// CheapestOffer is the offer a card's "Add to cart" button adds: the FIRST
	// offer of the product page (cheapest, ties by offer id). null = out of stock.
	CheapestOffer *CheapestOffer `json:"cheapestOffer"`
}

// CheapestOffer is the part of the cheapest buyable offer that the cart needs
// (its price is the item's PriceCents).
type CheapestOffer struct {
	OfferID    int64  `json:"offerId"`
	Stock      int64  `json:"stock"`
	SellerName string `json:"sellerName"`
}

// FacetOption is one entry of a filter group: a platform or region with the
// number of products that would match if the user picked it.
type FacetOption struct {
	Slug  string `json:"slug"`
	Name  string `json:"name"`
	Count int64  `json:"count"`
}

// PriceRange is the cheapest and the most expensive in-stock price (cents).
type PriceRange struct {
	MinCents int64 `json:"minCents"`
	MaxCents int64 `json:"maxCents"`
}

// Facets are the filter options that belong to the CURRENT result. Every
// group is counted with all the other active filters applied, except its own.
type Facets struct {
	Platforms  []FacetOption `json:"platforms"`
	Regions    []FacetOption `json:"regions"`
	PriceRange *PriceRange   `json:"priceRange"` // null when no in-stock product matches
}

// Page is the response of the listing: one page of items + the facets.
type Page struct {
	Items    []Item `json:"items"`
	Total    int64  `json:"total"` // all matching products, not only this page
	Page     int    `json:"page"`
	PageSize int    `json:"pageSize"`
	Facets   Facets `json:"facets"`
}

// Seller as shown next to an offer.
type Seller struct {
	Slug         string   `json:"slug"`
	Name         string   `json:"name"`
	Rating       *float64 `json:"rating"`      // null = new seller
	RatingLabel  *string  `json:"ratingLabel"` // "Superb" | "Excellent" | "Very good" | "Good" | null
	IsNew        bool     `json:"isNew"`
	ReviewsCount int64    `json:"reviewsCount"`
}

// Offer is one buyable offer (active and in stock).
type Offer struct {
	OfferID    int64  `json:"offerId"`
	PriceCents int64  `json:"priceCents"`
	Stock      int64  `json:"stock"`
	Seller     Seller `json:"seller"`
}

// ProductInfo is the product part of the product page.
type ProductInfo struct {
	Slug       string `json:"slug"`
	Edition    string `json:"edition"`
	Platform   Ref    `json:"platform"`
	Region     Ref    `json:"region"`
	MSRPCents  *int64 `json:"msrpCents"`
	PriceCents *int64 `json:"priceCents"` // cheapest buyable offer; null = out of stock
	InStock    bool   `json:"inStock"`
}

// GameInfo is the game part of the product page (same for all variants).
type GameInfo struct {
	Title       string   `json:"title"`
	Description string   `json:"description"` // "" = none
	Genres      []string `json:"genres"`
	ReleaseDate *string  `json:"releaseDate"` // "2015-05-19"; null = unknown
	Developer   *string  `json:"developer"`
	Publisher   *string  `json:"publisher"`
	CoverURL    *string  `json:"coverUrl"`
}

// Variant is another product of the same game ("other versions" on the page).
type Variant struct {
	Slug       string `json:"slug"`
	Edition    string `json:"edition"`
	Platform   Ref    `json:"platform"`
	Region     Ref    `json:"region"`
	PriceCents *int64 `json:"priceCents"`
	InStock    bool   `json:"inStock"`
}

// ProductDetail is the whole product page.
type ProductDetail struct {
	Product  ProductInfo `json:"product"`
	Game     GameInfo    `json:"game"`
	Offers   []Offer     `json:"offers"`   // cheapest first, never null
	Variants []Variant   `json:"variants"` // never null
}
