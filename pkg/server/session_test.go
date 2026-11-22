package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/auth"
)

// The exact Set-Cookie text matters (A3), so it is checked as the browser receives it.
func TestSessionCookie_attributes(t *testing.T) {
	rec := httptest.NewRecorder()
	http.SetCookie(rec, sessionCookie("TOKEN"))
	got := rec.Header().Get("Set-Cookie")
	for _, part := range []string{"session=TOKEN", "Path=/", "Max-Age=604800", "HttpOnly", "Secure", "SameSite=Lax"} {
		if !strings.Contains(got, part) {
			t.Errorf("Set-Cookie %q lacks %q", got, part)
		}
	}
	if strings.Contains(got, "Domain=") || strings.Contains(got, "Expires=") {
		t.Errorf("Set-Cookie %q: want a host-only cookie with Max-Age only", got)
	}
}

func TestClearedSessionCookie(t *testing.T) {
	rec := httptest.NewRecorder()
	http.SetCookie(rec, clearedSessionCookie())
	got := rec.Header().Get("Set-Cookie")
	// Max-Age=0 deletes the cookie; the other attributes must match the cookie being deleted.
	for _, part := range []string{"session=", "Path=/", "Max-Age=0", "HttpOnly", "Secure", "SameSite=Lax"} {
		if !strings.Contains(got, part) {
			t.Errorf("Set-Cookie %q lacks %q", got, part)
		}
	}
	if strings.HasPrefix(got, "session=TOKEN") {
		t.Errorf("cleared cookie still has a value: %q", got)
	}
}

func TestRequireUser(t *testing.T) {
	store := newFakeAuth()
	user, token := store.signedIn(t, "me@example.com")

	var got auth.User
	protected := requireUser(store, func(w http.ResponseWriter, _ *http.Request, u auth.User) {
		got = u
		w.WriteHeader(http.StatusOK)
	})
	call := func(cookie string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/api/orders", nil)
		if cookie != "" {
			r.AddCookie(&http.Cookie{Name: "session", Value: cookie})
		}
		rec := httptest.NewRecorder()
		protected.ServeHTTP(rec, r)
		return rec
	}

	t.Run("signed in -> the handler gets the user", func(t *testing.T) {
		rec := call(token)
		if rec.Code != http.StatusOK || got != user {
			t.Fatalf("status %d, user %+v; want 200 and %+v", rec.Code, got, user)
		}
		if rec.Header().Get("Cache-Control") != "no-store" {
			t.Error("a protected response must be no-store")
		}
	})
	t.Run("no cookie -> 401", func(t *testing.T) {
		assertJSONStatus(t, call(""), http.StatusUnauthorized, "not signed in")
	})
	t.Run("unknown token -> 401", func(t *testing.T) {
		other, _, _ := auth.NewSessionToken()
		assertJSONStatus(t, call(other), http.StatusUnauthorized, "not signed in")
	})
	t.Run("malformed cookie -> 401 without a database call", func(t *testing.T) {
		before := store.calls
		assertJSONStatus(t, call("not-a-token"), http.StatusUnauthorized, "not signed in")
		if store.calls != before {
			t.Fatal("a malformed cookie reached the store")
		}
	})
	t.Run("expired session -> 401", func(t *testing.T) {
		_, expiredToken := store.signedIn(t, "old@example.com")
		store.expire(expiredToken)
		assertJSONStatus(t, call(expiredToken), http.StatusUnauthorized, "not signed in")
	})
	for name, err := range unreachableErrors() {
		t.Run("503 "+name, func(t *testing.T) {
			store.failWith(err)
			defer store.failWith(nil)
			assertUnavailable(t, call(token))
		})
	}
	for name, err := range unexpectedErrors() {
		t.Run("500 "+name, func(t *testing.T) {
			store.failWith(err)
			defer store.failWith(nil)
			assertInternalError(t, call(token))
		})
	}
	t.Run("no store configured -> 503", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/api/orders", nil)
		r.AddCookie(&http.Cookie{Name: "session", Value: token})
		requireUser(nil, func(http.ResponseWriter, *http.Request, auth.User) { t.Fatal("handler ran") }).ServeHTTP(rec, r)
		assertUnavailable(t, rec)
	})
}
