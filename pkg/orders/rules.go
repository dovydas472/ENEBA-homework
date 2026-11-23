package orders

// THE CHECKOUT RULES, in one place.
//
// Everything here is a pure function (no database, no clock of its own), so every rule can be
// unit-tested and read without the SQL around it. store.go applies them inside transactions.
//
//	R1  Limits           1-20 lines, quantity 1-5 per line, no offer twice.            ValidateItems
//	R2  Server re-prices The client's price is only COMPARED with the database price.  ReviewLine
//	R3  Changes          Anything that differs -> no order, the changed lines listed.  ReviewLine, HasChanges
//	R4  Reservation      Keys are held 15 minutes; after that the order is expired.    ReservedUntil, EffectiveStatus
//	R5  Snapshots        An order item copies title, edition, platform, ... and price. (store.go, order_items)
//	R6  Pay / cancel     Which statuses may be paid / cancelled, and what happens.     DecidePay, DecideCancel
//	R7  Keys are secret  Key codes leave the server only inside a PAID order.          VisibleKeys
//	R8  Idempotency      The same (user, key) is the same order.                       store.go + UNIQUE in the DB
//	R9  Owner only       Another user's order does not exist for you (404).            store.go (user_id in every query)
//	R10 Unpaid cap       At most 3 pending, not-yet-expired orders per user.           PendingCapReached + store.go (user row lock)

import (
	"errors"
	"regexp"
	"strings"
	"time"
)

// R1: the limits.
const (
	MaxLines    = 20 // lines (different offers) in one order
	MaxQuantity = 5  // keys of one offer in one order
)

// R4: how long the keys of a pending order are reserved.
const ReservationTTL = 15 * time.Minute

// R10: how many unpaid orders (pending, reservation still running) one user may hold at once.
// Without it a script could keep reserving keys, 15 minutes at a time, and starve real buyers.
const MaxPendingOrders = 3

// PendingCapReached is R10: a user who already holds `pending` open orders may not create another.
// Paid, cancelled and expired orders do not count - only keys that are still being held.
func PendingCapReached(pending int) bool { return pending >= MaxPendingOrders }

// ValidationError is a bad request (HTTP 400). Its text is written for the client.
type ValidationError string

func (e ValidationError) Error() string { return string(e) }

// Errors the store returns; the HTTP layer maps each one to a status code.
var (
	ErrNotFound           = errors.New("orders: order not found")              // 404 (also: not your order, R9)
	ErrReservationExpired = errors.New("orders: reservation expired")          // 409
	ErrNotPayable         = errors.New("orders: order is not payable")         // 409
	ErrNotPending         = errors.New("orders: order is not pending")         // 409 (cancel)
	ErrPaymentDeclined    = errors.New("orders: payment declined (simulated)") // 402
	ErrTooManyPending     = errors.New("orders: too many unpaid orders")       // 409 (create, R10)
)

// ChangedError is returned instead of an order when the cart no longer matches the database (R3).
// Lines holds EVERY line, with its own list of changes, so the client can show what to fix.
type ChangedError struct{ Lines []Line }

func (e *ChangedError) Error() string { return "orders: cart changed" }

// ValidateItems is rule R1. It checks the shape of a request; it knows nothing about stock or prices.
func ValidateItems(items []CartItem) error {
	if len(items) == 0 {
		return ValidationError("items must contain at least one line")
	}
	if len(items) > MaxLines {
		return ValidationError("an order can have at most 20 lines")
	}
	seen := make(map[int64]bool, len(items))
	for _, it := range items {
		switch {
		case it.OfferID <= 0:
			return ValidationError("offerId must be a positive number")
		case it.Quantity < 1 || it.Quantity > MaxQuantity:
			return ValidationError("quantity must be between 1 and 5")
		case it.ExpectedPriceCents <= 0:
			return ValidationError("expectedPriceCents must be a positive number of cents")
		case seen[it.OfferID]:
			return ValidationError("an offer can appear only once; raise its quantity instead")
		}
		seen[it.OfferID] = true
	}
	return nil
}

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// IsUUID reports whether s is a UUID in the canonical 8-4-4-4-12 form (any letter case).
// A malformed order id in a URL is "not found", never a database error.
func IsUUID(s string) bool { return uuidPattern.MatchString(strings.ToLower(s)) }

// ValidateIdempotencyKey checks the client's key (R8) and returns it in lower case.
func ValidateIdempotencyKey(key string) (string, error) {
	if !IsUUID(key) {
		return "", ValidationError("idempotencyKey must be a UUID")
	}
	return strings.ToLower(key), nil
}

// ValidOutcome reports whether the simulated payment outcome is one we know.
func ValidOutcome(outcome string) bool {
	return outcome == OutcomeSuccess || outcome == OutcomeDecline
}

// OfferInfo is what the database says about an offer right now: the live price and state, plus
// the text that becomes the order item's snapshot (R5).
type OfferInfo struct {
	ID           int64
	PriceCents   int
	Active       bool
	ProductSlug  string
	Title        string
	Edition      string
	PlatformName string
	RegionName   string
	SellerName   string
	CoverURL     *string
}

// ReviewLine is rules R2 and R3 for ONE line: compare what the client wants with what the database
// has, and say what can really be bought.
//
//	offer == nil   the offer does not exist (e.g. the catalog was re-seeded) -> unavailable
//	stock          sellable keys of the offer right now (the caller decides how it counted)
//
// The result lists its changes in a fixed order: price_changed, unavailable, quantity_reduced.
func ReviewLine(item CartItem, offer *OfferInfo, stock int) Line {
	line := Line{OfferID: item.OfferID, Changes: []string{}}
	if offer == nil {
		line.Changes = append(line.Changes, ChangeUnavailable)
		return line
	}
	line.UnitPriceCents = offer.PriceCents
	line.Stock = max(stock, 0)
	line.ProductSlug, line.Title, line.Edition = offer.ProductSlug, offer.Title, offer.Edition
	line.PlatformName, line.RegionName, line.SellerName = offer.PlatformName, offer.RegionName, offer.SellerName
	line.CoverURL = offer.CoverURL

	// The price is compared, never trusted: the buyer is charged the DATABASE price.
	if offer.PriceCents != item.ExpectedPriceCents {
		line.Changes = append(line.Changes, ChangePriceChanged)
	}
	if !offer.Active || line.Stock == 0 {
		line.Changes = append(line.Changes, ChangeUnavailable)
		return line // Quantity 0, MaxQuantity 0, Available false
	}
	line.Available = true
	line.MaxQuantity = min(line.Stock, MaxQuantity)
	line.Quantity = min(item.Quantity, line.MaxQuantity)
	if line.Quantity < item.Quantity {
		line.Changes = append(line.Changes, ChangeQuantityReduced)
	}
	return line
}

// HasChanges: R3 - one changed line is enough to refuse the whole order.
func HasChanges(lines []Line) bool {
	for _, l := range lines {
		if len(l.Changes) > 0 {
			return true
		}
	}
	return false
}

// TotalCents is the price of the quantities that can be bought, in cents (never a float).
func TotalCents(lines []Line) int {
	total := 0
	for _, l := range lines {
		total += l.Quantity * l.UnitPriceCents
	}
	return total
}

// ReservedUntil is R4: the reservation of an order created at `now` ends 15 minutes later.
func ReservedUntil(now time.Time) time.Time { return now.Add(ReservationTTL) }

// EffectiveStatus is lazy expiry (R4): nothing flips a pending order to "expired" in the background,
// so every READ computes it - a pending order whose reservation has ended is expired.
func EffectiveStatus(status string, reservedUntil, now time.Time) string {
	if status == StatusPending && !now.Before(reservedUntil) {
		return StatusExpired
	}
	return status
}

// PayAction is what the pay transaction has to do with an order (R6).
type PayAction int

const (
	PayRun         PayAction = iota // pending and in time: run the payment
	PayAlreadyPaid                  // paid: return it unchanged (a double click / retry is not a second payment)
	PayExpireNow                    // pending but too late: mark it expired, release its keys, then 409
	PayExpired                      // already expired: 409 "Reservation expired"
	PayRefused                      // cancelled: 409 "Order is not payable"
)

// DecidePay is the state machine of paying. `status` is the STORED status (not the effective one):
// the "pending but too late" case must be recognised so the order is really marked expired.
func DecidePay(status string, reservedUntil, now time.Time) PayAction {
	switch status {
	case StatusPaid:
		return PayAlreadyPaid
	case StatusExpired:
		return PayExpired
	case StatusPending:
		if EffectiveStatus(status, reservedUntil, now) == StatusExpired {
			return PayExpireNow
		}
		return PayRun
	}
	return PayRefused // cancelled (or anything unknown)
}

// CancelAction is what the cancel transaction has to do (R6).
type CancelAction int

const (
	CancelRun       CancelAction = iota // pending and in time: cancel, release the keys
	CancelExpireNow                     // pending but too late: mark it expired and release, then 409
	CancelRefused                       // anything else: 409 "Order is not pending"
)

// DecideCancel: only a pending order can be cancelled. One whose time has run out is expired, not cancelled.
func DecideCancel(status string, reservedUntil, now time.Time) CancelAction {
	if status != StatusPending {
		return CancelRefused
	}
	if EffectiveStatus(status, reservedUntil, now) == StatusExpired {
		return CancelExpireNow
	}
	return CancelRun
}

// VisibleKeys is R7: the key codes are a secret that only a PAID order may show. For every other
// status it returns an empty (non-nil) slice, so the JSON is `"keys": []`, never `null`.
// The store also reads the codes only for paid orders; this is the second lock on the same door.
func VisibleKeys(status string, codes []string) []string {
	if status != StatusPaid || len(codes) == 0 {
		return []string{}
	}
	return codes
}
