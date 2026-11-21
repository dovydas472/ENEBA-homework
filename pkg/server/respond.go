package server

import (
	"encoding/json"
	"net/http"
)

// writeJSON writes v as a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeCached is writeJSON plus a Cache-Control header (used for successful catalog responses).
func writeCached(w http.ResponseWriter, status int, cacheControl string, v any) {
	w.Header().Set("Cache-Control", cacheControl)
	writeJSON(w, status, v)
}

// writeError writes a uniform JSON error body: {"error":"..."}.
// Errors are never cached: a CDN must not keep serving a 503 after the
// database is back, or a 404 for a product that was just added.
func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, status, map[string]string{"error": msg})
}

func notFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotFound, "not found")
}

func methodNotAllowed(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}
