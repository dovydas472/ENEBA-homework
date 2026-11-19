// Package handler is the single Vercel serverless function. Vercel calls the
// exported Handler for every request that vercel.json rewrites to /api.
// It only forwards to the shared router; all logic lives in pkg/.
package handler

import (
	"net/http"

	"github.com/dovydas472/ENEBA-homework/pkg/db"
	"github.com/dovydas472/ENEBA-homework/pkg/server"
)

// Built once per cold start and reused by every request this warm instance
// serves - including the DB pool (created lazily on first use, see pkg/db).
// Env vars come from the Vercel project settings (no .env loading here).
var router = server.NewRouter(server.Deps{DB: db.NewLazy()})

// Handler is the entry point Vercel looks for.
func Handler(w http.ResponseWriter, r *http.Request) {
	router.ServeHTTP(w, r)
}
