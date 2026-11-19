package server

import (
	"context"
	"log"
	"net/http"
	"time"
)

// dbPingTimeout is long enough to survive a Neon cold start (suspended
// compute waking up), but short enough that a dead DB does not hang the request.
const dbPingTimeout = 5 * time.Second

// DBPinger is the only thing the health handler needs from the database.
// Depending on this small interface (not on pgxpool) lets tests use a fake
// and keeps the handler independent of the DB driver.
type DBPinger interface {
	Ping(ctx context.Context) error
}

// healthResponse is the JSON body of GET /api/health.
// DBLatencyMs is a pointer so that it is omitted on error but a real 0 ms is kept.
type healthResponse struct {
	Status      string `json:"status"`
	DB          string `json:"db"`
	DBLatencyMs *int64 `json:"dbLatencyMs,omitempty"`
}

// healthHandler reports API and DB status separately.
//   - DB reachable      -> 200 {"status":"ok","db":"ok","dbLatencyMs":N}
//   - DB down / missing -> 503 {"status":"error","db":"error"}
//
// 503 (not 500) because the API itself is fine; a dependency is unavailable,
// which is exactly what monitors and load balancers expect from a health check.
// The real error goes to the server log only - never to the client.
func healthHandler(db DBPinger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			log.Printf("health: no database configured")
			writeJSON(w, http.StatusServiceUnavailable, healthResponse{Status: "error", DB: "error"})
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), dbPingTimeout)
		defer cancel()

		start := time.Now()
		if err := db.Ping(ctx); err != nil {
			log.Printf("health: db ping failed: %v", err)
			writeJSON(w, http.StatusServiceUnavailable, healthResponse{Status: "error", DB: "error"})
			return
		}
		ms := time.Since(start).Milliseconds()
		writeJSON(w, http.StatusOK, healthResponse{Status: "ok", DB: "ok", DBLatencyMs: &ms})
	}
}
