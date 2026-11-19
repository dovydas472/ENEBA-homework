// Package server holds the HTTP router and handlers. It is shared by the
// Vercel function (api/index.go) and the local dev server (cmd/local).
package server

import "net/http"

// NewRouter builds the application router using only the standard library.
// Go 1.22+ ServeMux supports "METHOD /path" patterns and {id} wildcards.
func NewRouter() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", health)
	// Same path, any other method -> JSON 405 (the more specific GET pattern wins).
	mux.HandleFunc("/api/health", methodNotAllowed)

	// Catch-all for everything else under /api/: JSON 404 instead of HTML/plain text.
	mux.HandleFunc("/api/", notFound)

	return mux
}
