package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakePinger lets tests control the DB result without a real database.
type fakePinger struct{ err error }

func (f fakePinger) Ping(context.Context) error { return f.err }

func TestHealth(t *testing.T) {
	const secret = "postgres://user:s3cret@host-pooler.example/db"

	tests := []struct {
		name       string
		db         DBPinger
		wantStatus int
		wantBody   map[string]any
		wantLat    bool
	}{
		{"ping ok", fakePinger{}, http.StatusOK, map[string]any{"status": "ok", "db": "ok"}, true},
		{"ping error", fakePinger{err: errors.New("dial " + secret + ": refused")}, http.StatusServiceUnavailable, map[string]any{"status": "error", "db": "error"}, false},
		{"db not configured (nil)", nil, http.StatusServiceUnavailable, map[string]any{"status": "error", "db": "error"}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := NewRouter(Deps{DB: tt.db})
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q", ct)
			}

			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("body is not JSON: %v", err)
			}
			for k, want := range tt.wantBody {
				if body[k] != want {
					t.Errorf("body[%q] = %v, want %v", k, body[k], want)
				}
			}
			if _, has := body["dbLatencyMs"]; has != tt.wantLat {
				t.Errorf("dbLatencyMs present = %v, want %v", has, tt.wantLat)
			}

			// The raw error text / connection string must never reach the client.
			for _, leak := range []string{"s3cret", "refused", "postgres://"} {
				if strings.Contains(rec.Body.String(), leak) {
					t.Errorf("response leaks %q: %s", leak, rec.Body.String())
				}
			}
		})
	}
}
