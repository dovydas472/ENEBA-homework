// Package server holds the HTTP router and handlers. It is shared by the
// Vercel function (api/index.go) and the local dev server (cmd/local).
package server

import "net/http"

// Deps are the things handlers need from the outside world. They are passed
// in explicitly (no globals inside handlers), which keeps handlers testable.
type Deps struct {
	DB      DBPinger
	Catalog CatalogReader
}

// NewRouter builds the application router using only the standard library.
// Go 1.22+ ServeMux supports "METHOD /path" patterns and {id} wildcards.
func NewRouter(deps Deps) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", healthHandler(deps.DB))
	// Same path, any other method -> JSON 405 (the more specific GET pattern wins).
	mux.HandleFunc("/api/health", methodNotAllowed)

	mux.HandleFunc("GET /api/products", productsHandler(deps.Catalog))
	mux.HandleFunc("/api/products", methodNotAllowed)
	mux.HandleFunc("GET /api/products/{slug}", productHandler(deps.Catalog))
	mux.HandleFunc("/api/products/{slug}", methodNotAllowed)
	mux.HandleFunc("GET /api/search/suggest", suggestHandler(deps.Catalog))
	mux.HandleFunc("/api/search/suggest", methodNotAllowed)

	// Catch-all for everything else under /api/: JSON 404 instead of HTML/plain text.
	mux.HandleFunc("/api/", notFound)

	return mux
}
