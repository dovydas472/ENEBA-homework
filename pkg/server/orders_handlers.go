package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/dovydas472/ENEBA-homework/pkg/auth"
	"github.com/dovydas472/ENEBA-homework/pkg/orders"
)

// OrderStore is everything the checkout handlers need from the data layer (a small interface, like
// CatalogReader and AuthStore: handler tests plug in a fake). *orders.Store implements it.
type OrderStore interface {
	Quote(ctx context.Context, items []orders.CartItem) (orders.Quote, error)
	CreateOrder(ctx context.Context, userID int64, req orders.CreateRequest) (order orders.Order, created bool, err error)
	ListOrders(ctx context.Context, userID int64) ([]orders.Summary, error)
	GetOrder(ctx context.Context, userID int64, id string) (orders.Order, time.Time, error)
	PayOrder(ctx context.Context, userID int64, id, outcome string) (orders.Order, error)
	CancelOrder(ctx context.Context, userID int64, id string) (orders.Order, error)
}

// Messages the user sees (written for the client, safe to return as they are).
const (
	msgCartChanged        = "cart_changed" // a code, not a sentence: the client looks at `lines`
	msgReservationExpired = "Reservation expired"
	msgNotPayable         = "Order is not payable"
	msgNotPending         = "Order is not pending"
	msgPaymentDeclined    = "Payment declined (simulated)"
	msgOrderNotFound      = "order not found"
	msgBadOrderBody       = "Request body must be JSON, see the API section of the README"
)

// maxOrderBody caps a checkout request body: 20 lines are well under 4 KiB, 16 KiB is generous.
const maxOrderBody = 16 << 10

// The response bodies are objects, not bare values, so fields can be added without breaking clients.
type (
	quoteRequest struct {
		Items []orders.CartItem `json:"items"`
	}
	payRequest struct {
		Outcome string `json:"outcome"`
	}
	orderResponse struct {
		Order orders.Order `json:"order"`
	}
	orderDetailResponse struct {
		Order      orders.Order `json:"order"`
		ServerTime time.Time    `json:"serverTime"`
	}
	ordersResponse struct {
		Orders []orders.Summary `json:"orders"`
	}
	cartChangedResponse struct {
		Error string        `json:"error"`
		Lines []orders.Line `json:"lines"`
	}
)

// readOrderJSON decodes a JSON request body into v. On a bad body it answers 400 and returns false.
func readOrderJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxOrderBody)).Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, msgBadOrderBody)
		return false
	}
	return true
}

// orderFailed turns an error of the orders store into the HTTP answer of the API contract.
// Anything that is not one of ours is a database problem: 503 / 500, generic text, details only in the log.
func orderFailed(w http.ResponseWriter, what string, err error) {
	var invalid orders.ValidationError
	var changed *orders.ChangedError
	switch {
	case errors.As(err, &invalid):
		writeError(w, http.StatusBadRequest, invalid.Error())
	case errors.As(err, &changed):
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusConflict, cartChangedResponse{Error: msgCartChanged, Lines: changed.Lines})
	case errors.Is(err, orders.ErrNotFound):
		writeError(w, http.StatusNotFound, msgOrderNotFound)
	case errors.Is(err, orders.ErrReservationExpired):
		writeError(w, http.StatusConflict, msgReservationExpired)
	case errors.Is(err, orders.ErrNotPayable):
		writeError(w, http.StatusConflict, msgNotPayable)
	case errors.Is(err, orders.ErrNotPending):
		writeError(w, http.StatusConflict, msgNotPending)
	case errors.Is(err, orders.ErrPaymentDeclined):
		writeError(w, http.StatusPaymentRequired, msgPaymentDeclined)
	default:
		storeFailed(w, what, err)
	}
}

// quoteHandler serves POST /api/checkout/quote {items} -> 200 {lines, totalCents}.
// Public (no sign-in): it only re-prices a cart, it reserves nothing.
func quoteHandler(store OrderStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req quoteRequest
		if !readOrderJSON(w, r, &req) {
			return
		}
		if store == nil {
			unavailable(w, "quote", errors.New("no order store configured"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		q, err := store.Quote(ctx, req.Items)
		if err != nil {
			orderFailed(w, "quote", err)
			return
		}
		writeJSON(w, http.StatusOK, q)
	}
}

// createOrderHandler serves POST /api/orders {idempotencyKey, items} (signed in):
//   - 201 {order}: a new pending order, its keys reserved for 15 minutes
//   - 200 {order}: the same user sent the same idempotencyKey before - the same order, nothing new
//   - 409 {error:"cart_changed", lines}: price, stock or offer state differs; nothing was created
//   - 400 invalid body
func createOrderHandler(store OrderStore) userHandler {
	return func(w http.ResponseWriter, r *http.Request, user auth.User) {
		var req orders.CreateRequest
		if !readOrderJSON(w, r, &req) {
			return
		}
		if store == nil {
			unavailable(w, "create order", errors.New("no order store configured"))
			return
		}
		order, created, err := store.CreateOrder(r.Context(), user.ID, req)
		if err != nil {
			orderFailed(w, "create order", err)
			return
		}
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		writeJSON(w, status, orderResponse{Order: order})
	}
}

// listOrdersHandler serves GET /api/orders -> 200 {orders}, newest first.
func listOrdersHandler(store OrderStore) userHandler {
	return func(w http.ResponseWriter, r *http.Request, user auth.User) {
		if store == nil {
			unavailable(w, "list orders", errors.New("no order store configured"))
			return
		}
		list, err := store.ListOrders(r.Context(), user.ID)
		if err != nil {
			orderFailed(w, "list orders", err)
			return
		}
		writeJSON(w, http.StatusOK, ordersResponse{Orders: list})
	}
}

// getOrderHandler serves GET /api/orders/{id} -> 200 {order, serverTime}.
// Someone else's order and an unknown id both give 404: the answer never reveals that an order exists.
func getOrderHandler(store OrderStore) userHandler {
	return func(w http.ResponseWriter, r *http.Request, user auth.User) {
		if store == nil {
			unavailable(w, "get order", errors.New("no order store configured"))
			return
		}
		order, serverTime, err := store.GetOrder(r.Context(), user.ID, r.PathValue("id"))
		if err != nil {
			orderFailed(w, "get order", err)
			return
		}
		writeJSON(w, http.StatusOK, orderDetailResponse{Order: order, ServerTime: serverTime.UTC()})
	}
}

// payOrderHandler serves POST /api/orders/{id}/pay {outcome: "success" | "decline"}.
//   - 200 {order}: paid (also when it was already paid: nothing is charged twice)
//   - 402 "Payment declined (simulated)": the order stays pending, the user may try again
//   - 409 "Reservation expired" / "Order is not payable"
//   - 404 not your order
func payOrderHandler(store OrderStore) userHandler {
	return func(w http.ResponseWriter, r *http.Request, user auth.User) {
		var req payRequest
		if !readOrderJSON(w, r, &req) {
			return
		}
		if store == nil {
			unavailable(w, "pay order", errors.New("no order store configured"))
			return
		}
		order, err := store.PayOrder(r.Context(), user.ID, r.PathValue("id"), req.Outcome)
		if err != nil {
			orderFailed(w, "pay order", err)
			return
		}
		writeJSON(w, http.StatusOK, orderResponse{Order: order})
	}
}

// cancelOrderHandler serves POST /api/orders/{id}/cancel -> 200 {order}; 409 when it is not pending.
func cancelOrderHandler(store OrderStore) userHandler {
	return func(w http.ResponseWriter, r *http.Request, user auth.User) {
		if store == nil {
			unavailable(w, "cancel order", errors.New("no order store configured"))
			return
		}
		order, err := store.CancelOrder(r.Context(), user.ID, r.PathValue("id"))
		if err != nil {
			orderFailed(w, "cancel order", err)
			return
		}
		writeJSON(w, http.StatusOK, orderResponse{Order: order})
	}
}
