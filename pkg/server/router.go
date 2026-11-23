// Package server holds the HTTP router and handlers. It is shared by the
// Vercel function (api/index.go) and the local dev server (cmd/local).
package server

import "net/http"

// Deps are the things handlers need from the outside world. They are passed
// in explicitly (no globals inside handlers), which keeps handlers testable.
type Deps struct {
	DB      DBPinger
	Catalog CatalogReader
	Auth    AuthStore
	Orders  OrderStore
}

// NewRouter builds the application router using only the standard library.
// Go 1.22+ ServeMux supports "METHOD /path" patterns and {id} wildcards.
//
// The whole mux is wrapped in requireSameOrigin (origin.go): every POST, PUT,
// PATCH and DELETE must come from our own site (CSRF protection), including
// the endpoints that later tasks add.
func NewRouter(deps Deps) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", healthHandler(deps.DB))
	// Same path, any other method -> JSON 405 (the more specific GET pattern wins).
	mux.HandleFunc("/api/health", methodNotAllowed)

	// Catalog: public and cacheable. These handlers never read the session
	// cookie, so the cached answer is the same for every visitor.
	mux.HandleFunc("GET /api/products", productsHandler(deps.Catalog))
	mux.HandleFunc("/api/products", methodNotAllowed)
	mux.HandleFunc("GET /api/products/{slug}", productHandler(deps.Catalog))
	mux.HandleFunc("/api/products/{slug}", methodNotAllowed)
	mux.HandleFunc("GET /api/search/suggest", suggestHandler(deps.Catalog))
	mux.HandleFunc("/api/search/suggest", methodNotAllowed)

	// Auth (Task 14): every response is Cache-Control: no-store.
	mux.HandleFunc("POST /api/auth/register", noStore(registerHandler(deps.Auth)))
	mux.HandleFunc("/api/auth/register", methodNotAllowed)
	mux.HandleFunc("POST /api/auth/login", noStore(loginHandler(deps.Auth)))
	mux.HandleFunc("/api/auth/login", methodNotAllowed)
	mux.HandleFunc("POST /api/auth/logout", noStore(logoutHandler(deps.Auth)))
	mux.HandleFunc("/api/auth/logout", methodNotAllowed)
	mux.HandleFunc("POST /api/auth/demo", noStore(demoHandler(deps.Auth)))
	mux.HandleFunc("/api/auth/demo", methodNotAllowed)
	mux.HandleFunc("GET /api/auth/me", requireUser(sessionReader(deps.Auth), meHandler))
	mux.HandleFunc("/api/auth/me", methodNotAllowed)

	// Checkout (Task 16a): every response is Cache-Control: no-store. The quote is public (it only
	// re-prices a cart); everything that touches an order needs a signed-in user, and an order id
	// that is not yours answers 404 exactly like an unknown one.
	sessions := sessionReader(deps.Auth)
	mux.HandleFunc("POST /api/checkout/quote", noStore(quoteHandler(deps.Orders)))
	mux.HandleFunc("/api/checkout/quote", methodNotAllowed)
	mux.HandleFunc("POST /api/orders", requireUser(sessions, createOrderHandler(deps.Orders)))
	mux.HandleFunc("GET /api/orders", requireUser(sessions, listOrdersHandler(deps.Orders)))
	mux.HandleFunc("/api/orders", methodNotAllowed)
	mux.HandleFunc("GET /api/orders/{id}", requireUser(sessions, getOrderHandler(deps.Orders)))
	mux.HandleFunc("/api/orders/{id}", methodNotAllowed)
	mux.HandleFunc("POST /api/orders/{id}/pay", requireUser(sessions, payOrderHandler(deps.Orders)))
	mux.HandleFunc("/api/orders/{id}/pay", methodNotAllowed)
	mux.HandleFunc("POST /api/orders/{id}/cancel", requireUser(sessions, cancelOrderHandler(deps.Orders)))
	mux.HandleFunc("/api/orders/{id}/cancel", methodNotAllowed)

	// Catch-all for everything else under /api/: JSON 404 instead of HTML/plain text.
	mux.HandleFunc("/api/", notFound)

	return requireSameOrigin(mux)
}

// sessionReader passes the auth store on as the smaller SessionReader, keeping
// a missing store a real nil (an interface holding a nil AuthStore is not nil).
func sessionReader(a AuthStore) SessionReader {
	if a == nil {
		return nil
	}
	return a
}
