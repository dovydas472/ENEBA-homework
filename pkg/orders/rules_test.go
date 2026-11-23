package orders

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestValidateItems(t *testing.T) {
	ok := CartItem{OfferID: 1, Quantity: 2, ExpectedPriceCents: 999}
	many := make([]CartItem, 21)
	for i := range many {
		many[i] = CartItem{OfferID: int64(i + 1), Quantity: 1, ExpectedPriceCents: 100}
	}
	tests := []struct {
		name    string
		items   []CartItem
		wantErr string // "" = valid
	}{
		{"one line", []CartItem{ok}, ""},
		{"20 lines (the maximum)", many[:20], ""},
		{"no lines", nil, "at least one"},
		{"21 lines", many, "at most 20"},
		{"offer id 0", []CartItem{{OfferID: 0, Quantity: 1, ExpectedPriceCents: 1}}, "offerId"},
		{"negative offer id", []CartItem{{OfferID: -4, Quantity: 1, ExpectedPriceCents: 1}}, "offerId"},
		{"quantity 0", []CartItem{{OfferID: 1, Quantity: 0, ExpectedPriceCents: 1}}, "quantity"},
		{"quantity 6", []CartItem{{OfferID: 1, Quantity: 6, ExpectedPriceCents: 1}}, "quantity"},
		{"quantity 5 (the maximum)", []CartItem{{OfferID: 1, Quantity: 5, ExpectedPriceCents: 1}}, ""},
		{"price 0", []CartItem{{OfferID: 1, Quantity: 1, ExpectedPriceCents: 0}}, "expectedPriceCents"},
		{"the same offer twice", []CartItem{ok, ok}, "only once"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateItems(tc.items)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if _, isValidation := err.(ValidationError); !isValidation || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("error = %v (%T), want a ValidationError containing %q", err, err, tc.wantErr)
			}
		})
	}
}

func TestValidateIdempotencyKey(t *testing.T) {
	got, err := ValidateIdempotencyKey("3F2504E0-4F89-41D3-9A0C-0305E82C3301")
	if err != nil || got != "3f2504e0-4f89-41d3-9a0c-0305e82c3301" {
		t.Fatalf("got %q, %v; want the key in lower case", got, err)
	}
	for _, bad := range []string{"", "abc", "3f2504e0-4f89-41d3-9a0c-0305e82c330", "3f2504e0-4f89-41d3-9a0c-0305e82c33011", "zf2504e0-4f89-41d3-9a0c-0305e82c3301", "1; DROP TABLE orders"} {
		if _, err := ValidateIdempotencyKey(bad); err == nil {
			t.Errorf("%q accepted, want a validation error", bad)
		}
	}
}

func TestReviewLine(t *testing.T) {
	offer := OfferInfo{ID: 7, PriceCents: 1999, Active: true, ProductSlug: "p", Title: "T", Edition: "Standard",
		PlatformName: "PC", RegionName: "Global", SellerName: "S"}
	item := func(qty, price int) CartItem { return CartItem{OfferID: 7, Quantity: qty, ExpectedPriceCents: price} }
	inactive := offer
	inactive.Active = false

	tests := []struct {
		name        string
		item        CartItem
		offer       *OfferInfo
		stock       int
		wantChanges []string
		wantQty     int
		wantMax     int
		wantAvail   bool
	}{
		{"nothing changed", item(2, 1999), &offer, 10, []string{}, 2, 5, true},
		{"price went up", item(1, 1500), &offer, 10, []string{ChangePriceChanged}, 1, 5, true},
		{"price went down", item(1, 2500), &offer, 10, []string{ChangePriceChanged}, 1, 5, true},
		{"only 3 keys left of 5 wanted", item(5, 1999), &offer, 3, []string{ChangeQuantityReduced}, 3, 3, true},
		{"stock is plenty: capped at 5 per order", item(5, 1999), &offer, 50, []string{}, 5, 5, true},
		{"out of stock", item(1, 1999), &offer, 0, []string{ChangeUnavailable}, 0, 0, false},
		{"offer paused", item(1, 1999), &inactive, 10, []string{ChangeUnavailable}, 0, 0, false},
		{"price changed AND reduced", item(4, 1000), &offer, 2, []string{ChangePriceChanged, ChangeQuantityReduced}, 2, 2, true},
		{"price changed AND out of stock", item(1, 1000), &offer, 0, []string{ChangePriceChanged, ChangeUnavailable}, 0, 0, false},
		{"the offer does not exist", item(1, 1999), nil, 0, []string{ChangeUnavailable}, 0, 0, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			l := ReviewLine(tc.item, tc.offer, tc.stock)
			if !reflect.DeepEqual(l.Changes, tc.wantChanges) {
				t.Errorf("changes = %v, want %v", l.Changes, tc.wantChanges)
			}
			if l.Quantity != tc.wantQty || l.MaxQuantity != tc.wantMax || l.Available != tc.wantAvail {
				t.Errorf("quantity/max/available = %d/%d/%v, want %d/%d/%v",
					l.Quantity, l.MaxQuantity, l.Available, tc.wantQty, tc.wantMax, tc.wantAvail)
			}
			if l.Changes == nil {
				t.Error("changes must be an empty slice, not nil (the JSON would be null)")
			}
			if tc.offer != nil && l.UnitPriceCents != 1999 {
				t.Errorf("unit price = %d, want the database price 1999, whatever the client expected", l.UnitPriceCents)
			}
		})
	}
}

func TestHasChangesAndTotal(t *testing.T) {
	clean := []Line{{Quantity: 2, UnitPriceCents: 500, Changes: []string{}}, {Quantity: 1, UnitPriceCents: 250, Changes: []string{}}}
	if HasChanges(clean) {
		t.Error("lines without changes reported as changed")
	}
	if got := TotalCents(clean); got != 1250 {
		t.Errorf("total = %d, want 1250 (integer cents)", got)
	}
	changed := append(clean, Line{Changes: []string{ChangeUnavailable}})
	if !HasChanges(changed) {
		t.Error("one changed line must make the whole cart changed")
	}
}

func TestEffectiveStatus(t *testing.T) {
	until := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name, status string
		now          time.Time
		want         string
	}{
		{"pending before the end", StatusPending, until.Add(-time.Second), StatusPending},
		{"pending exactly at the end", StatusPending, until, StatusExpired},
		{"pending after the end", StatusPending, until.Add(time.Hour), StatusExpired},
		{"paid is never expired", StatusPaid, until.Add(time.Hour), StatusPaid},
		{"cancelled stays cancelled", StatusCancelled, until.Add(time.Hour), StatusCancelled},
	}
	for _, tc := range tests {
		if got := EffectiveStatus(tc.status, until, tc.now); got != tc.want {
			t.Errorf("%s: %q, want %q", tc.name, got, tc.want)
		}
	}
	if got := ReservedUntil(until); got != until.Add(15*time.Minute) {
		t.Errorf("ReservedUntil = %v, want +15 minutes", got)
	}
}

func TestDecidePay(t *testing.T) {
	until := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	early, late := until.Add(-time.Minute), until.Add(time.Minute)
	tests := []struct {
		name, status string
		now          time.Time
		want         PayAction
	}{
		{"pending in time", StatusPending, early, PayRun},
		{"pending too late", StatusPending, late, PayExpireNow},
		{"paid (also when late)", StatusPaid, late, PayAlreadyPaid},
		{"already expired", StatusExpired, early, PayExpired},
		{"cancelled", StatusCancelled, early, PayRefused},
		{"unknown status", "weird", early, PayRefused},
	}
	for _, tc := range tests {
		if got := DecidePay(tc.status, until, tc.now); got != tc.want {
			t.Errorf("%s: action %d, want %d", tc.name, got, tc.want)
		}
	}
}

func TestDecideCancel(t *testing.T) {
	until := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	early, late := until.Add(-time.Minute), until.Add(time.Minute)
	tests := []struct {
		name, status string
		now          time.Time
		want         CancelAction
	}{
		{"pending in time", StatusPending, early, CancelRun},
		{"pending too late", StatusPending, late, CancelExpireNow},
		{"paid", StatusPaid, early, CancelRefused},
		{"expired", StatusExpired, early, CancelRefused},
		{"cancelled twice", StatusCancelled, early, CancelRefused},
	}
	for _, tc := range tests {
		if got := DecideCancel(tc.status, until, tc.now); got != tc.want {
			t.Errorf("%s: action %d, want %d", tc.name, got, tc.want)
		}
	}
}

// R7: key codes leave the server only inside a paid order.
func TestVisibleKeys_onlyWhenPaid(t *testing.T) {
	codes := []string{"DEMO-AAAA-BBBB-CCCC"}
	for _, status := range []string{StatusPending, StatusExpired, StatusCancelled, ""} {
		got := VisibleKeys(status, codes)
		if got == nil || len(got) != 0 {
			t.Errorf("status %q: keys = %#v, want an empty non-nil slice", status, got)
		}
	}
	if got := VisibleKeys(StatusPaid, codes); !reflect.DeepEqual(got, codes) {
		t.Errorf("paid: keys = %v, want %v", got, codes)
	}
	if got := VisibleKeys(StatusPaid, nil); got == nil || len(got) != 0 {
		t.Errorf("paid without codes: %#v, want an empty non-nil slice", got)
	}
}

func TestValidOutcome(t *testing.T) {
	for _, o := range []string{OutcomeSuccess, OutcomeDecline} {
		if !ValidOutcome(o) {
			t.Errorf("%q rejected", o)
		}
	}
	for _, o := range []string{"", "ok", "SUCCESS", "succeeded"} {
		if ValidOutcome(o) {
			t.Errorf("%q accepted", o)
		}
	}
}
