// Package handler is the single Vercel serverless function. Vercel calls the
// exported Handler for every request that vercel.json rewrites to /api.
// It only forwards to the shared router; all logic lives in internal/.
package handler

import (
	"net/http"

	"github.com/dovydas472/ENEBA-homework/internal/server"
)

// The router is built once per cold start and reused across invocations.
var router = server.NewRouter()

// Handler is the entry point Vercel looks for.
func Handler(w http.ResponseWriter, r *http.Request) {
	router.ServeHTTP(w, r)
}
