package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dovydas472/ENEBA-homework/pkg/db"
	"github.com/dovydas472/ENEBA-homework/pkg/orders"
)

// fakeOrders is an OrderStore that returns canned answers and records what the handler passed in.
type fakeOrders struct {
	err     error // returned by every method when set
	created bool  // CreateOrder's "created" flag
	order   orders.Order

	gotUserID  int64
	gotID      string
	gotOutcome string
	gotReq     orders.CreateRequest
	gotItems   []orders.CartItem
	calls      int
}

func (f *fakeOrders) Quote(_ context.Context, items []orders.CartItem) (orders.Quote, error) {
	f.calls++
	f.gotItems = items
	return orders.Quote{Lines: []orders.Line{{OfferID: 1, Changes: []string{}}}, TotalCents: 0}, f.err
}

func (f *fakeOrders) CreateOrder(_ context.Context, userID int64, req orders.CreateRequest) (orders.Order, bool, error) {
	f.calls++
	f.gotUserID, f.gotReq = userID, req
	return f.order, f.created, f.err
}

func (f *fakeOrders) ListOrders(_ context.Context, userID int64) ([]orders.Summary, error) {
	f.calls++
	f.gotUserID = userID
	return []orders.Summary{{ID: "o1", Status: "pending"}}, f.err
}

func (f *fakeOrders) GetOrder(_ context.Context, userID int64, id string) (orders.Order, time.Time, error) {
	f.calls++
	f.gotUserID, f.gotID = userID, id
	return f.order, time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC), f.err
}

func (f *fakeOrders) PayOrder(_ context.Context, userID int64, id, outcome string) (orders.Order, error) {
	f.calls++
	f.gotUserID, f.gotID, f.gotOutcome = userID, id, outcome
	return f.order, f.err
}

func (f *fakeOrders) CancelOrder(_ context.Context, userID int64, id string) (orders.Order, error) {
	f.calls++
	f.gotUserID, f.gotID = userID, id
	return f.order, f.err
}

const orderID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

// call sends a request through the full router; cookie "" = not signed in.
func callOrders(t *testing.T, a AuthStore, o OrderStore, method, path, body, cookie string) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if method == http.MethodGet {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = sameOriginRequest(method, path, strings.NewReader(body))
	}
	if cookie != "" {
		r.AddCookie(&http.Cookie{Name: "session", Value: cookie})
	}
	rec := httptest.NewRecorder()
	NewRouter(Deps{Auth: a, Orders: o}).ServeHTTP(rec, r)
	return rec
}

func TestOrderRoutes_requireSignIn(t *testing.T) {
	auth := newFakeAuth()
	store := &fakeOrders{}
	for _, c := range []struct{ method, path string }{
		{"POST", "/api/orders"},
		{"GET", "/api/orders"},
		{"GET", "/api/orders/" + orderID},
		{"POST", "/api/orders/" + orderID + "/pay"},
		{"POST", "/api/orders/" + orderID + "/cancel"},
	} {
		rec := callOrders(t, auth, store, c.method, c.path, `{}`, "")
		assertJSONStatus(t, rec, http.StatusUnauthorized, "not signed in")
	}
	if store.calls != 0 {
		t.Errorf("the store was called %d times for signed-out requests, want 0", store.calls)
	}
}

func TestQuote_isPublicAndPassesTheItems(t *testing.T) {
	store := &fakeOrders{}
	body := `{"items":[{"offerId":4,"quantity":2,"expectedPriceCents":1500}]}`
	rec := callOrders(t, newFakeAuth(), store, "POST", "/api/checkout/quote", body, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d (%s), want 200 without a session", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Error("the quote must be no-store")
	}
	if len(store.gotItems) != 1 || store.gotItems[0] != (orders.CartItem{OfferID: 4, Quantity: 2, ExpectedPriceCents: 1500}) {
		t.Errorf("items passed to the store = %+v", store.gotItems)
	}
	var got struct {
		Lines []map[string]any `json:"lines"`
		Total *int             `json:"totalCents"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || len(got.Lines) != 1 || got.Total == nil {
		t.Errorf("body %s is not {lines, totalCents}", rec.Body.String())
	}
}

func TestCreateOrder_201ThenOKForTheSameKey(t *testing.T) {
	auth := newFakeAuth()
	user, token := auth.signedIn(t, "me@example.com")
	want := orders.Order{ID: orderID, Status: "pending", TotalCents: 3000, Items: []orders.OrderItem{{Keys: []string{}}}}
	store := &fakeOrders{order: want, created: true}
	body := `{"idempotencyKey":"` + orderID + `","items":[{"offerId":1,"quantity":1,"expectedPriceCents":3000}]}`

	rec := callOrders(t, auth, store, "POST", "/api/orders", body, token)
	if rec.Code != http.StatusCreated {
		t.Fatalf("first call: status %d (%s), want 201", rec.Code, rec.Body.String())
	}
	if store.gotUserID != user.ID || store.gotReq.IdempotencyKey != orderID || len(store.gotReq.Items) != 1 {
		t.Errorf("the store got user %d, request %+v", store.gotUserID, store.gotReq)
	}
	var resp struct {
		Order orders.Order `json:"order"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil || resp.Order.ID != orderID {
		t.Errorf("body %s, want {order: ...}", rec.Body.String())
	}

	store.created = false // the store says: this key was used before
	rec = callOrders(t, auth, store, "POST", "/api/orders", body, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("repeat call: status %d, want 200", rec.Code)
	}
}

func TestCreateOrder_cartChangedIs409WithTheLines(t *testing.T) {
	auth := newFakeAuth()
	_, token := auth.signedIn(t, "me@example.com")
	lines := []orders.Line{{OfferID: 9, Quantity: 0, Changes: []string{orders.ChangeUnavailable}}}
	store := &fakeOrders{err: &orders.ChangedError{Lines: lines}}

	rec := callOrders(t, auth, store, "POST", "/api/orders", `{"idempotencyKey":"x","items":[]}`, token)
	if rec.Code != http.StatusConflict || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status %d, cache %q; want 409 no-store", rec.Code, rec.Header().Get("Cache-Control"))
	}
	var got struct {
		Error string        `json:"error"`
		Lines []orders.Line `json:"lines"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Error != "cart_changed" || len(got.Lines) != 1 || got.Lines[0].Changes[0] != orders.ChangeUnavailable {
		t.Errorf("body %s, want {error:cart_changed, lines:[unavailable]}", rec.Body.String())
	}
}

func TestOrderErrors_mapToTheContract(t *testing.T) {
	auth := newFakeAuth()
	_, token := auth.signedIn(t, "me@example.com")
	tests := []struct {
		name   string
		err    error
		status int
		msg    string
	}{
		{"validation", orders.ValidationError("quantity must be between 1 and 5"), 400, "quantity must be between 1 and 5"},
		{"not found", orders.ErrNotFound, 404, "order not found"},
		{"wrapped not found", fmt.Errorf("x: %w", orders.ErrNotFound), 404, "order not found"},
		{"expired", orders.ErrReservationExpired, 409, "Reservation expired"},
		{"not payable", orders.ErrNotPayable, 409, "Order is not payable"},
		{"not pending", orders.ErrNotPending, 409, "Order is not pending"},
		{"declined", orders.ErrPaymentDeclined, 402, "Payment declined (simulated)"},
		{"too many unpaid orders", orders.ErrTooManyPending, 409, "Too many unpaid orders – pay or cancel one first"},
		{"database down", fmt.Errorf("%w: connect to db.secret-host:5432", db.ErrUnavailable), 503, "service temporarily unavailable"},
		{"sql error", errors.New(`ERROR: relation "orders" does not exist (SQLSTATE 42P01)`), 500, "internal error"},
	}
	calls := []struct{ method, path, body string }{
		{"POST", "/api/orders/" + orderID + "/pay", `{"outcome":"success"}`},
		{"POST", "/api/orders/" + orderID + "/cancel", ``},
		{"GET", "/api/orders/" + orderID, ``},
		{"GET", "/api/orders", ``},
		{"POST", "/api/orders", `{"idempotencyKey":"x","items":[]}`},
	}
	for _, tc := range tests {
		for _, c := range calls {
			t.Run(tc.name+" "+c.method+" "+c.path[:min(len(c.path), 12)], func(t *testing.T) {
				rec := callOrders(t, auth, &fakeOrders{err: tc.err}, c.method, c.path, c.body, token)
				assertJSONStatus(t, rec, tc.status, tc.msg)
				if strings.Contains(rec.Body.String(), "secret-host") || strings.Contains(rec.Body.String(), "SQLSTATE") {
					t.Errorf("driver details leaked to the client: %s", rec.Body.String())
				}
			})
		}
	}
}

func TestPayAndCancelAndGet_passUserAndPathId(t *testing.T) {
	auth := newFakeAuth()
	user, token := auth.signedIn(t, "me@example.com")
	store := &fakeOrders{order: orders.Order{ID: orderID, Status: "paid"}}

	rec := callOrders(t, auth, store, "POST", "/api/orders/"+orderID+"/pay", `{"outcome":"decline"}`, token)
	if rec.Code != 200 || store.gotUserID != user.ID || store.gotID != orderID || store.gotOutcome != "decline" {
		t.Errorf("pay: status %d, user %d, id %q, outcome %q", rec.Code, store.gotUserID, store.gotID, store.gotOutcome)
	}

	rec = callOrders(t, auth, store, "POST", "/api/orders/"+orderID+"/cancel", ``, token)
	if rec.Code != 200 || store.gotUserID != user.ID || store.gotID != orderID {
		t.Errorf("cancel: status %d, user %d, id %q", rec.Code, store.gotUserID, store.gotID)
	}

	rec = callOrders(t, auth, store, "GET", "/api/orders/"+orderID, ``, token)
	var got struct {
		Order      orders.Order `json:"order"`
		ServerTime string       `json:"serverTime"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || rec.Code != 200 {
		t.Fatalf("get: status %d body %s", rec.Code, rec.Body.String())
	}
	if got.ServerTime != "2026-01-02T03:04:05Z" || got.Order.ID != orderID {
		t.Errorf("get body = %s", rec.Body.String())
	}

	rec = callOrders(t, auth, store, "GET", "/api/orders", ``, token)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"orders":[`) {
		t.Errorf("list: status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestOrderHandlers_badBodyIs400(t *testing.T) {
	auth := newFakeAuth()
	_, token := auth.signedIn(t, "me@example.com")
	store := &fakeOrders{}
	for _, path := range []string{"/api/orders", "/api/orders/" + orderID + "/pay"} {
		rec := callOrders(t, auth, store, "POST", path, `not json`, token)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", path, rec.Code)
		}
	}
	rec := callOrders(t, auth, store, "POST", "/api/checkout/quote", `[1,2]`, "")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("quote with a JSON array: status %d, want 400", rec.Code)
	}
	if store.calls != 0 {
		t.Error("the store must not be called for a body that does not parse")
	}
}

func TestOrderHandlers_noStoreConfiguredIs503(t *testing.T) {
	auth := newFakeAuth()
	_, token := auth.signedIn(t, "me@example.com")
	rec := callOrders(t, auth, nil, "GET", "/api/orders", ``, token)
	assertJSONStatus(t, rec, http.StatusServiceUnavailable, "service temporarily unavailable")
	rec = callOrders(t, auth, nil, "POST", "/api/checkout/quote", `{"items":[]}`, "")
	assertJSONStatus(t, rec, http.StatusServiceUnavailable, "service temporarily unavailable")
}

func TestOrderRoutes_otherMethodsAre405(t *testing.T) {
	auth := newFakeAuth()
	_, token := auth.signedIn(t, "me@example.com")
	for _, c := range []struct{ method, path string }{
		{"PUT", "/api/orders"},
		{"DELETE", "/api/orders/" + orderID},
		{"GET", "/api/orders/" + orderID + "/pay"},
		{"GET", "/api/checkout/quote"},
	} {
		rec := callOrders(t, auth, &fakeOrders{}, c.method, c.path, `{}`, token)
		assertJSONStatus(t, rec, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func TestOrderRoutes_crossOriginPostIsBlocked(t *testing.T) {
	auth := newFakeAuth()
	_, token := auth.signedIn(t, "me@example.com")
	store := &fakeOrders{}
	r := httptest.NewRequest("POST", "/api/orders/"+orderID+"/pay", strings.NewReader(`{"outcome":"success"}`))
	r.Header.Set("Origin", "https://evil.example")
	r.AddCookie(&http.Cookie{Name: "session", Value: token})
	rec := httptest.NewRecorder()
	NewRouter(Deps{Auth: auth, Orders: store}).ServeHTTP(rec, r)
	if rec.Code != http.StatusForbidden || store.calls != 0 {
		t.Errorf("status %d, store calls %d; want 403 and 0", rec.Code, store.calls)
	}
}
