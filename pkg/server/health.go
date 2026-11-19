package server

import "net/http"

// health is a liveness check: it proves the function is deployed and routed.
// It deliberately touches no database.
func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
