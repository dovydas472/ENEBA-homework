package server

// Integration tests: the full router with the REAL auth.Store on a real Postgres
// (pkg/testdb, schema only). Skipped when TEST_DATABASE_URL is empty; CI's
// `migrations` job runs them. They cover the flows of the task (section 5).

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dovydas472/ENEBA-homework/pkg/auth"
	"github.com/dovydas472/ENEBA-homework/pkg/testdb"
)

func realAuth(t *testing.T) (http.Handler, *pgxpool.Pool) {
	t.Helper()
	pool := testdb.Migrated(t)
	return NewRouter(Deps{Auth: auth.NewStoreFromPool(pool)}), pool
}

func newEmail() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return "flow-" + hex.EncodeToString(b) + "@example.com"
}

// send runs one request through the router; cookie is the session token ("" = none).
func send(t *testing.T, h http.Handler, method, path, body, cookie string) *httptest.ResponseRecorder {
	t.Helper()
	r := sameOriginRequest(method, path, strings.NewReader(body))
	if cookie != "" {
		r.AddCookie(&http.Cookie{Name: "session", Value: cookie})
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func userOf(t *testing.T, rec *httptest.ResponseRecorder) auth.User {
	t.Helper()
	var body userResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %s: %v", rec.Body.String(), err)
	}
	return body.User
}

func tokenOf(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	c := sessionCookieFrom(rec)
	if c == nil || c.Value == "" {
		t.Fatalf("no session cookie in the response (status %d)", rec.Code)
	}
	return c.Value
}

func TestAuthFlow_registerMeLogoutMe(t *testing.T) {
	h, _ := realAuth(t)
	email := newEmail()

	rec := send(t, h, "POST", "/api/auth/register", creds(email, "my password 1"), "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("register = %d %s", rec.Code, rec.Body.String())
	}
	token := tokenOf(t, rec)
	registered := userOf(t, rec)

	rec = send(t, h, "GET", "/api/auth/me", "", token)
	if rec.Code != http.StatusOK || userOf(t, rec) != registered {
		t.Fatalf("me = %d %s, want 200 %+v", rec.Code, rec.Body.String(), registered)
	}

	if rec = send(t, h, "POST", "/api/auth/logout", "", token); rec.Code != http.StatusNoContent {
		t.Fatalf("logout = %d", rec.Code)
	}
	// The old cookie value is now worthless, even if the browser kept it.
	if rec = send(t, h, "GET", "/api/auth/me", "", token); rec.Code != http.StatusUnauthorized {
		t.Fatalf("me after logout = %d, want 401", rec.Code)
	}

	// And signing in again works with the same password.
	rec = send(t, h, "POST", "/api/auth/login", creds(email, "my password 1"), "")
	if rec.Code != http.StatusOK || userOf(t, rec) != registered {
		t.Fatalf("login = %d %s", rec.Code, rec.Body.String())
	}
}

func TestAuthFlow_duplicateEmailIs409CaseInsensitive(t *testing.T) {
	h, _ := realAuth(t)
	email := newEmail()
	if rec := send(t, h, "POST", "/api/auth/register", creds(email, "my password 1"), ""); rec.Code != http.StatusCreated {
		t.Fatalf("first register = %d", rec.Code)
	}
	rec := send(t, h, "POST", "/api/auth/register", creds(strings.ToUpper(email), "another password"), "")
	assertJSONStatus(t, rec, http.StatusConflict, "An account with this email already exists")
}

func TestAuthFlow_wrongPasswordIsGeneric401(t *testing.T) {
	h, _ := realAuth(t)
	email := newEmail()
	send(t, h, "POST", "/api/auth/register", creds(email, "my password 1"), "")

	wrong := send(t, h, "POST", "/api/auth/login", creds(email, "my password 2"), "")
	unknown := send(t, h, "POST", "/api/auth/login", creds(newEmail(), "my password 1"), "")
	for _, rec := range []*httptest.ResponseRecorder{wrong, unknown} {
		assertJSONStatus(t, rec, http.StatusUnauthorized, "Invalid email or password")
	}
	if wrong.Body.String() != unknown.Body.String() {
		t.Fatal("wrong password and unknown email must give the same answer")
	}
}

func TestAuthFlow_eleventhFailureIs429(t *testing.T) {
	h, _ := realAuth(t)
	email := newEmail()
	send(t, h, "POST", "/api/auth/register", creds(email, "my password 1"), "")

	for i := 1; i <= auth.MaxFailedLogins; i++ {
		if rec := send(t, h, "POST", "/api/auth/login", creds(email, "wrong password"), ""); rec.Code != http.StatusUnauthorized {
			t.Fatalf("failure %d = %d, want 401", i, rec.Code)
		}
	}
	// The 11th attempt is refused - even with the right password.
	rec := send(t, h, "POST", "/api/auth/login", creds(email, "my password 1"), "")
	assertJSONStatus(t, rec, http.StatusTooManyRequests, "Too many failed sign-in attempts. Try again later.")
	if ra := rec.Header().Get("Retry-After"); ra == "" || ra == "0" {
		t.Fatalf("Retry-After = %q", ra)
	}
}

func TestAuthFlow_successClearsTheCounter(t *testing.T) {
	h, pool := realAuth(t)
	email := newEmail()
	send(t, h, "POST", "/api/auth/register", creds(email, "my password 1"), "")

	for range auth.MaxFailedLogins - 1 {
		send(t, h, "POST", "/api/auth/login", creds(email, "wrong password"), "")
	}
	if rec := send(t, h, "POST", "/api/auth/login", creds(email, "my password 1"), ""); rec.Code != http.StatusOK {
		t.Fatalf("login after 9 failures = %d, want 200", rec.Code)
	}
	var rows int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM login_failures WHERE email = $1`, email).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("counter rows = %d (%v), want 0 after a successful sign-in", rows, err)
	}
	// Without the clear, the 10th failure would have blocked the account; now it is a plain 401.
	if rec := send(t, h, "POST", "/api/auth/login", creds(email, "wrong password"), ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("next failure = %d, want 401", rec.Code)
	}
}

func TestAuthFlow_twoDemoClicksAreTwoUsers(t *testing.T) {
	h, _ := realAuth(t)
	first := send(t, h, "POST", "/api/auth/demo", "", "")
	second := send(t, h, "POST", "/api/auth/demo", "", "")
	if first.Code != http.StatusCreated || second.Code != http.StatusCreated {
		t.Fatalf("demo = %d / %d", first.Code, second.Code)
	}
	a, b := userOf(t, first), userOf(t, second)
	if a.ID == b.ID || !a.IsDemo || !b.IsDemo {
		t.Fatalf("demo users %+v / %+v", a, b)
	}
	// Each browser sees its own demo user.
	if me := userOf(t, send(t, h, "GET", "/api/auth/me", "", tokenOf(t, first))); me != a {
		t.Fatalf("me (first) = %+v", me)
	}
	if me := userOf(t, send(t, h, "GET", "/api/auth/me", "", tokenOf(t, second))); me != b {
		t.Fatalf("me (second) = %+v", me)
	}
	// A demo account has no password: signing in to it with one fails like any wrong password.
	rec := send(t, h, "POST", "/api/auth/login", creds(a.Email, "any password 1"), "")
	assertJSONStatus(t, rec, http.StatusUnauthorized, "Invalid email or password")
}

func TestAuthFlow_expiredSessionIs401(t *testing.T) {
	h, pool := realAuth(t)
	rec := send(t, h, "POST", "/api/auth/register", creds(newEmail(), "my password 1"), "")
	token := tokenOf(t, rec)
	hash, _ := auth.HashSessionToken(token)
	if _, err := pool.Exec(context.Background(), `
		UPDATE sessions SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
		WHERE token_hash = $1`, hash); err != nil {
		t.Fatal(err)
	}
	assertJSONStatus(t, send(t, h, "GET", "/api/auth/me", "", token), http.StatusUnauthorized, "not signed in")
}
