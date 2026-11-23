// Package orders is the checkout: quote a cart, create an order that reserves keys,
// pay it (simulated), cancel it, read it back.
//
//   - rules.go  - every business rule that needs no database (limits, change detection,
//     status transitions, "keys only when paid"). Pure functions, unit-tested.
//   - store.go  - the SQL: the transactions that apply those rules to real rows.
//
// The JSON field names are the API contract of Task 16a (camelCase); the frontend types in
// src/api/types.ts mirror them.
package orders

import "time"

// Order statuses (the CHECK constraint of orders.status has the same list).
const (
	StatusPending   = "pending"
	StatusPaid      = "paid"
	StatusExpired   = "expired"
	StatusCancelled = "cancelled"
)

// Payment outcomes the client may ask the simulated payment for.
const (
	OutcomeSuccess = "success"
	OutcomeDecline = "decline"
)

// Why a quote line differs from what the client asked for.
const (
	ChangePriceChanged    = "price_changed"
	ChangeQuantityReduced = "quantity_reduced"
	ChangeUnavailable     = "unavailable"
)

// CartItem is one line the client sends: which offer, how many, and the price the
// buyer saw. The server never trusts the price - it only compares it (rule R2).
type CartItem struct {
	OfferID            int64 `json:"offerId"`
	Quantity           int   `json:"quantity"`
	ExpectedPriceCents int   `json:"expectedPriceCents"`
}

// Line is the server's view of one cart line (answer of the quote, and of a refused order).
// Quantity is what can really be bought now (0 = nothing).
type Line struct {
	OfferID        int64    `json:"offerId"`
	Quantity       int      `json:"quantity"`
	UnitPriceCents int      `json:"unitPriceCents"`
	Stock          int      `json:"stock"`
	MaxQuantity    int      `json:"maxQuantity"`
	Available      bool     `json:"available"`
	ProductSlug    string   `json:"productSlug"`
	Title          string   `json:"title"`
	Edition        string   `json:"edition"`
	PlatformName   string   `json:"platformName"`
	RegionName     string   `json:"regionName"`
	SellerName     string   `json:"sellerName"`
	CoverURL       *string  `json:"coverUrl"`
	Changes        []string `json:"changes"` // never null: [] when nothing changed
}

// Quote is the body of POST /api/checkout/quote.
type Quote struct {
	Lines      []Line `json:"lines"`
	TotalCents int    `json:"totalCents"`
}

// OrderItem is one line of an order: a snapshot of what was bought (rule R5).
// Keys is always an array and is filled only for a PAID order (rule R7).
type OrderItem struct {
	OfferID        int64    `json:"offerId"`
	ProductSlug    string   `json:"productSlug"`
	Title          string   `json:"title"`
	Edition        string   `json:"edition"`
	PlatformName   string   `json:"platformName"`
	RegionName     string   `json:"regionName"`
	SellerName     string   `json:"sellerName"`
	UnitPriceCents int      `json:"unitPriceCents"`
	Quantity       int      `json:"quantity"`
	Keys           []string `json:"keys"`
}

// Order is the full order as the API returns it. PaidAt is null until paid.
type Order struct {
	ID            string      `json:"id"`
	Status        string      `json:"status"`
	TotalCents    int         `json:"totalCents"`
	CreatedAt     time.Time   `json:"createdAt"`
	ReservedUntil time.Time   `json:"reservedUntil"`
	PaidAt        *time.Time  `json:"paidAt"`
	Items         []OrderItem `json:"items"`
}

// Summary is one row of GET /api/orders.
type Summary struct {
	ID            string    `json:"id"`
	Status        string    `json:"status"`
	TotalCents    int       `json:"totalCents"`
	ItemCount     int       `json:"itemCount"` // keys in the order (sum of the quantities)
	CreatedAt     time.Time `json:"createdAt"`
	ReservedUntil time.Time `json:"reservedUntil"`
}

// CreateRequest is the body of POST /api/orders.
type CreateRequest struct {
	IdempotencyKey string     `json:"idempotencyKey"`
	Items          []CartItem `json:"items"`
}
