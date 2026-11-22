package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dovydas472/ENEBA-homework/pkg/auth"
)

// ---------------------------------------------------------------------------
// fakeAuth: an in-memory AuthStore. It behaves like the real one (case-
// insensitive emails, sessions by token hash, a failure counter) so the
// handlers can be tested without a database. The real SQL is covered by the
// integration tests (auth_integration_test.go, pkg/auth).
// ---------------------------------------------------------------------------

type fakeAccount struct {
	user auth.User
	hash string // "" = demo account
}

type fakeAuth struct {
	accounts map[string]fakeAccount // key: lower-case email
	sessions map[string]int64       // key: string(token hash) -> user id
	expired  map[string]bool        // token hashes whose session has expired
	failures map[string]int         // key: lower-case email
	nextID   int64
	err      error // when set, every method returns it
	calls    int

	createdHashes []string // password hashes passed to CreateUser
	recorded      []string // emails passed to RecordLoginFailure
	cleared       []string // emails passed to ClearLoginFailures
	lookedUp      []string // emails passed to UserByEmail
}

func newFakeAuth() *fakeAuth {
	return &fakeAuth{accounts: map[string]fakeAccount{}, sessions: map[string]int64{}, expired: map[string]bool{}, failures: map[string]int{}}
}

func (f *fakeAuth) failWith(err error) { f.err = err }

func (f *fakeAuth) userByID(id int64) auth.User {
	for _, a := range f.accounts {
		if a.user.ID == id {
			return a.user
		}
	}
	return auth.User{}
}

func (f *fakeAuth) CreateUser(_ context.Context, email, hash string) (auth.User, error) {
	f.calls++
	if f.err != nil {
		return auth.User{}, f.err
	}
	if _, taken := f.accounts[strings.ToLower(email)]; taken {
		return auth.User{}, auth.ErrEmailTaken
	}
	f.nextID++
	u := auth.User{ID: f.nextID, Email: email}
	f.accounts[strings.ToLower(email)] = fakeAccount{user: u, hash: hash}
	f.createdHashes = append(f.createdHashes, hash)
	return u, nil
}

func (f *fakeAuth) CreateDemoUser(context.Context) (auth.User, error) {
	f.calls++
	if f.err != nil {
		return auth.User{}, f.err
	}
	f.nextID++
	u := auth.User{ID: f.nextID, Email: "demo-" + string(rune('a'+f.nextID)) + "@demo.invalid", IsDemo: true}
	f.accounts[u.Email] = fakeAccount{user: u}
	return u, nil
}

func (f *fakeAuth) UserByEmail(_ context.Context, email string) (auth.User, string, error) {
	f.calls++
	f.lookedUp = append(f.lookedUp, email)
	if f.err != nil {
		return auth.User{}, "", f.err
	}
	a, ok := f.accounts[strings.ToLower(email)]
	if !ok {
		return auth.User{}, "", auth.ErrUserNotFound
	}
	return a.user, a.hash, nil
}

func (f *fakeAuth) CreateSession(_ context.Context, userID int64, hash []byte) error {
	f.calls++
	if f.err != nil {
		return f.err
	}
	f.sessions[string(hash)] = userID
	return nil
}

func (f *fakeAuth) UserBySession(_ context.Context, hash []byte) (auth.User, error) {
	f.calls++
	if f.err != nil {
		return auth.User{}, f.err
	}
	id, ok := f.sessions[string(hash)]
	if !ok || f.expired[string(hash)] {
		delete(f.sessions, string(hash))
		return auth.User{}, auth.ErrNoSession
	}
	return f.userByID(id), nil
}

func (f *fakeAuth) DeleteSession(_ context.Context, hash []byte) error {
	f.calls++
	if f.err != nil {
		return f.err
	}
	delete(f.sessions, string(hash))
	return nil
}

func (f *fakeAuth) LoginBlocked(_ context.Context, email string) (time.Duration, bool, error) {
	f.calls++
	if f.err != nil {
		return 0, false, f.err
	}
	if f.failures[strings.ToLower(email)] >= auth.MaxFailedLogins {
		return 89500 * time.Millisecond, true, nil // 89.5 s -> "Retry-After: 90"
	}
	return 0, false, nil
}

func (f *fakeAuth) RecordLoginFailure(_ context.Context, email string) error {
	f.calls++
	if f.err != nil {
		return f.err
	}
	f.recorded = append(f.recorded, email)
	f.failures[strings.ToLower(email)]++
	return nil
}

func (f *fakeAuth) ClearLoginFailures(_ context.Context, email string) error {
	f.calls++
	if f.err != nil {
		return f.err
	}
	f.cleared = append(f.cleared, email)
	delete(f.failures, strings.ToLower(email))
	return nil
}

// A real argon2id hash of testPassword, computed once (each hash takes ~20-50 ms).
const testPassword = "correct horse 1"

var (
	knownHashOnce sync.Once
	knownHash     string
)

// addAccount stores an account whose password is testPassword.
func (f *fakeAuth) addAccount(t *testing.T, email string) auth.User {
	t.Helper()
	knownHashOnce.Do(func() {
		h, err := auth.HashPassword(testPassword)
		if err != nil {
			panic(err)
		}
		knownHash = h
	})
	f.nextID++
	u := auth.User{ID: f.nextID, Email: email}
	f.accounts[strings.ToLower(email)] = fakeAccount{user: u, hash: knownHash}
	return u
}

// signedIn adds an account plus a live session and returns the cookie token.
func (f *fakeAuth) signedIn(t *testing.T, email string) (auth.User, string) {
	t.Helper()
	u := f.addAccount(t, email)
	token, hash, err := auth.NewSessionToken()
	if err != nil {
		t.Fatal(err)
	}
	f.sessions[string(hash)] = u.ID
	return u, token
}

func (f *fakeAuth) expire(token string) {
	hash, _ := auth.HashSessionToken(token)
	f.expired[string(hash)] = true
}

func (f *fakeAuth) hasSession(token string) bool {
	hash, _ := auth.HashSessionToken(token)
	_, ok := f.sessions[string(hash)]
	return ok
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// post sends a same-origin JSON POST (optionally with a session cookie) through the full router.
func post(t *testing.T, store AuthStore, path, body, cookie string) *httptest.ResponseRecorder {
	t.Helper()
	r := sameOriginRequest(http.MethodPost, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		r.AddCookie(&http.Cookie{Name: "session", Value: cookie})
	}
	rec := httptest.NewRecorder()
	NewRouter(Deps{Auth: store}).ServeHTTP(rec, r)
	return rec
}

func getMe(t *testing.T, store AuthStore, cookie string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	if cookie != "" {
		r.AddCookie(&http.Cookie{Name: "session", Value: cookie})
	}
	rec := httptest.NewRecorder()
	NewRouter(Deps{Auth: store}).ServeHTTP(rec, r)
	return rec
}

func creds(email, password string) string {
	b, _ := json.Marshal(map[string]string{"email": email, "password": password})
	return string(b)
}

// assertJSONStatus checks the status, no-store, and the {"error": msg} body.
func assertJSONStatus(t *testing.T, rec *httptest.ResponseRecorder, status int, msg string) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, status, rec.Body.String())
	}
	assertJSONError(t, rec, msg)
}

func assertJSONError(t *testing.T, rec *httptest.ResponseRecorder, msg string) {
	t.Helper()
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body["error"] != msg || len(body) != 1 {
		t.Errorf("body = %s, want {\"error\":%q}", rec.Body.String(), msg)
	}
}

// sessionCookieFrom returns the session cookie the response sets (nil if none).
func sessionCookieFrom(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == "session" {
			return c
		}
	}
	return nil
}

// assertSignedIn checks a successful sign-in answer: status, the exact user JSON, no-store and a fresh session cookie.
func assertSignedIn(t *testing.T, rec *httptest.ResponseRecorder, status int, store *fakeAuth, want auth.User) string {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d (body %s)", rec.Code, status, rec.Body.String())
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Error("auth response must be no-store")
	}
	// Exactly {"user":{"id","email","isDemo"}}: never a hash or anything else.
	var body map[string]map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || len(body) != 1 || len(body["user"]) != 3 {
		t.Fatalf("body = %s, want {\"user\":{id,email,isDemo}}", rec.Body.String())
	}
	u := body["user"]
	if u["id"] != float64(want.ID) || u["email"] != want.Email || u["isDemo"] != want.IsDemo {
		t.Fatalf("user = %v, want %+v", u, want)
	}
	if strings.Contains(rec.Body.String(), "argon2") {
		t.Fatal("response contains a password hash")
	}
	c := sessionCookieFrom(rec)
	if c == nil || c.Value == "" || c.MaxAge != int(auth.SessionTTL.Seconds()) || !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("session cookie = %+v", c)
	}
	if !store.hasSession(c.Value) {
		t.Fatal("the cookie's token has no session in the store")
	}
	return c.Value
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

func TestRegister_createsAccountAndSignsIn(t *testing.T) {
	store := newFakeAuth()
	rec := post(t, store, "/api/auth/register", creds("  New@Example.com ", "my password 1"), "")
	assertSignedIn(t, rec, http.StatusCreated, store, auth.User{ID: 1, Email: "New@Example.com"})

	// The store got an argon2id hash, never the password itself.
	if len(store.createdHashes) != 1 || !strings.HasPrefix(store.createdHashes[0], "$argon2id$") ||
		strings.Contains(store.createdHashes[0], "my password 1") {
		t.Fatalf("stored hash = %v", store.createdHashes)
	}
	if ok, _ := auth.VerifyPassword(store.createdHashes[0], "my password 1"); !ok {
		t.Fatal("stored hash does not verify the password")
	}
}

func TestRegister_validationIs400(t *testing.T) {
	cases := map[string]struct{ body, msg string }{
		"not JSON":         {"email=a", msgBadBody},
		"empty body":       {"", msgBadBody},
		"array":            {`["a@b.c","12345678"]`, msgBadBody},
		"body over 4 KiB":  {creds("a@example.com", strings.Repeat("x", 5000)), msgBadBody},
		"no email":         {creds("", "my password 1"), "Enter your email"},
		"bad email":        {creds("not-an-email", "my password 1"), "Enter a valid email address"},
		"demo domain":      {creds("x@demo.invalid", "my password 1"), "This email domain is reserved"},
		"short password":   {creds("a@example.com", "1234567"), "Password must be at least 8 characters"},
		"129 characters":   {creds("a@example.com", strings.Repeat("x", 129)), "Password must be at most 128 characters"},
		"missing password": {`{"email":"a@example.com"}`, "Password must be at least 8 characters"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			store := newFakeAuth()
			assertJSONStatus(t, post(t, store, "/api/auth/register", c.body, ""), http.StatusBadRequest, c.msg)
			if store.calls != 0 {
				t.Fatal("invalid input reached the store")
			}
		})
	}
}

func TestRegister_takenEmailIs409(t *testing.T) {
	store := newFakeAuth()
	store.addAccount(t, "taken@example.com")
	rec := post(t, store, "/api/auth/register", creds("TAKEN@example.com", "my password 1"), "")
	assertJSONStatus(t, rec, http.StatusConflict, "An account with this email already exists")
	if sessionCookieFrom(rec) != nil {
		t.Fatal("a failed sign-up must not set a cookie")
	}
}

func TestRegister_databaseErrors(t *testing.T) {
	for name, err := range unreachableErrors() {
		t.Run("503 "+name, func(t *testing.T) {
			store := newFakeAuth()
			store.failWith(err)
			assertUnavailable(t, post(t, store, "/api/auth/register", creds("a@example.com", "my password 1"), ""))
		})
	}
	for name, err := range unexpectedErrors() {
		t.Run("500 "+name, func(t *testing.T) {
			store := newFakeAuth()
			store.failWith(err)
			assertInternalError(t, post(t, store, "/api/auth/register", creds("a@example.com", "my password 1"), ""))
		})
	}
	t.Run("503 no store configured", func(t *testing.T) {
		assertUnavailable(t, post(t, nil, "/api/auth/register", creds("a@example.com", "my password 1"), ""))
	})
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

func TestLogin_success(t *testing.T) {
	store := newFakeAuth()
	user := store.addAccount(t, "me@example.com")
	store.failures["me@example.com"] = 3

	rec := post(t, store, "/api/auth/login", creds("ME@example.com", testPassword), "")
	assertSignedIn(t, rec, http.StatusOK, store, user)
	if len(store.cleared) != 1 || store.failures["me@example.com"] != 0 {
		t.Fatalf("a successful sign-in must clear the failure counter (cleared %v)", store.cleared)
	}
}

// Every failure looks the same: one status, one text, and every one is counted (A6, A7).
func TestLogin_failuresAreGenericAndCounted(t *testing.T) {
	store := newFakeAuth()
	store.addAccount(t, "me@example.com")
	demo, _ := store.CreateDemoUser(context.Background())

	cases := map[string]string{
		"unknown email":  creds("nobody@example.com", testPassword),
		"wrong password": creds("me@example.com", "wrong password"),
		"short password": creds("me@example.com", "short"),
		"demo account":   creds(demo.Email, "any password 1"),
	}
	var bodies []string
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			before := len(store.recorded)
			rec := post(t, store, "/api/auth/login", body, "")
			assertJSONStatus(t, rec, http.StatusUnauthorized, "Invalid email or password")
			if sessionCookieFrom(rec) != nil {
				t.Fatal("a failed sign-in must not set a cookie")
			}
			if len(store.recorded) != before+1 {
				t.Fatal("the failure was not recorded")
			}
			bodies = append(bodies, rec.Body.String())
		})
	}
	for _, b := range bodies[1:] {
		if b != bodies[0] {
			t.Fatalf("failure bodies differ: %q vs %q", b, bodies[0])
		}
	}
}

func TestLogin_rateLimitedIs429WithRetryAfter(t *testing.T) {
	store := newFakeAuth()
	store.addAccount(t, "me@example.com")
	store.failures["me@example.com"] = auth.MaxFailedLogins

	// Even the RIGHT password is refused while blocked: guessing must stop.
	rec := post(t, store, "/api/auth/login", creds("me@example.com", testPassword), "")
	assertJSONStatus(t, rec, http.StatusTooManyRequests, "Too many failed sign-in attempts. Try again later.")
	if got := rec.Header().Get("Retry-After"); got != "90" {
		t.Errorf("Retry-After = %q, want \"90\" (89.5 s rounded up)", got)
	}
	if len(store.lookedUp) != 0 {
		t.Fatal("a blocked sign-in must not look up the user or check the password")
	}
	if sessionCookieFrom(rec) != nil {
		t.Fatal("a blocked sign-in must not set a cookie")
	}
}

func TestLogin_validationIs400(t *testing.T) {
	cases := map[string]struct{ body, msg string }{
		"not JSON":     {"{", msgBadBody},
		"no email":     {creds("", testPassword), "Enter your email"},
		"bad email":    {creds("nope", testPassword), "Enter a valid email address"},
		"no password":  {creds("me@example.com", ""), "Enter your password"},
		"129 password": {creds("me@example.com", strings.Repeat("x", 129)), "Password must be at most 128 characters"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			store := newFakeAuth()
			assertJSONStatus(t, post(t, store, "/api/auth/login", c.body, ""), http.StatusBadRequest, c.msg)
			if store.calls != 0 {
				t.Fatal("invalid input reached the store")
			}
		})
	}
}

func TestLogin_databaseErrors(t *testing.T) {
	for name, err := range unreachableErrors() {
		t.Run("503 "+name, func(t *testing.T) {
			store := newFakeAuth()
			store.failWith(err)
			assertUnavailable(t, post(t, store, "/api/auth/login", creds("me@example.com", testPassword), ""))
		})
	}
	for name, err := range unexpectedErrors() {
		t.Run("500 "+name, func(t *testing.T) {
			store := newFakeAuth()
			store.failWith(err)
			assertInternalError(t, post(t, store, "/api/auth/login", creds("me@example.com", testPassword), ""))
		})
	}
}

// A browser that was signed in (e.g. as a demo user) and signs in again keeps only the new session.
func TestLogin_replacesThePreviousSession(t *testing.T) {
	store := newFakeAuth()
	_, oldToken := store.signedIn(t, "demo@example.com")
	user := store.addAccount(t, "me@example.com")

	rec := post(t, store, "/api/auth/login", creds("me@example.com", testPassword), oldToken)
	newToken := assertSignedIn(t, rec, http.StatusOK, store, user)
	if store.hasSession(oldToken) || newToken == oldToken {
		t.Fatal("the previous session of this browser must be deleted")
	}
}

// ---------------------------------------------------------------------------
// logout, demo, me
// ---------------------------------------------------------------------------

func TestLogout(t *testing.T) {
	assertLoggedOut := func(t *testing.T, rec *httptest.ResponseRecorder) {
		t.Helper()
		if rec.Code != http.StatusNoContent || rec.Body.Len() != 0 {
			t.Fatalf("status %d body %q, want 204 and no body", rec.Code, rec.Body.String())
		}
		if rec.Header().Get("Cache-Control") != "no-store" {
			t.Error("logout must be no-store")
		}
		c := sessionCookieFrom(rec)
		if c == nil || c.MaxAge != -1 || c.Value != "" { // net/http parses "Max-Age=0" as -1
			t.Fatalf("cookie = %+v, want the session cookie cleared", c)
		}
	}
	t.Run("signed in: session deleted, cookie cleared", func(t *testing.T) {
		store := newFakeAuth()
		_, token := store.signedIn(t, "me@example.com")
		assertLoggedOut(t, post(t, store, "/api/auth/logout", "", token))
		if store.hasSession(token) {
			t.Fatal("session row still exists")
		}
		if rec := getMe(t, store, token); rec.Code != http.StatusUnauthorized {
			t.Fatalf("me after logout = %d, want 401", rec.Code)
		}
	})
	t.Run("already signed out: still 204", func(t *testing.T) {
		assertLoggedOut(t, post(t, newFakeAuth(), "/api/auth/logout", "", ""))
	})
	t.Run("malformed cookie: 204 without a database call", func(t *testing.T) {
		store := newFakeAuth()
		assertLoggedOut(t, post(t, store, "/api/auth/logout", "", "garbage"))
		if store.calls != 0 {
			t.Fatal("store called")
		}
	})
	t.Run("database down: cookie cleared anyway, 503", func(t *testing.T) {
		store := newFakeAuth()
		_, token := store.signedIn(t, "me@example.com")
		store.failWith(unreachableErrors()["DATABASE_URL not set"])
		rec := post(t, store, "/api/auth/logout", "", token)
		assertUnavailable(t, rec)
		if c := sessionCookieFrom(rec); c == nil || c.MaxAge != -1 {
			t.Fatalf("cookie = %+v, want it cleared", c)
		}
	})
}

func TestDemo_newAccountEveryClick(t *testing.T) {
	store := newFakeAuth()
	first := post(t, store, "/api/auth/demo", "", "")
	assertSignedIn(t, first, http.StatusCreated, store, auth.User{ID: 1, Email: "demo-b@demo.invalid", IsDemo: true})
	second := post(t, store, "/api/auth/demo", "", "")
	assertSignedIn(t, second, http.StatusCreated, store, auth.User{ID: 2, Email: "demo-c@demo.invalid", IsDemo: true})

	for name, err := range unreachableErrors() {
		t.Run("503 "+name, func(t *testing.T) {
			s := newFakeAuth()
			s.failWith(err)
			assertUnavailable(t, post(t, s, "/api/auth/demo", "", ""))
		})
	}
}

func TestMe(t *testing.T) {
	store := newFakeAuth()
	user, token := store.signedIn(t, "me@example.com")

	rec := getMe(t, store, token)
	if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status %d, Cache-Control %q", rec.Code, rec.Header().Get("Cache-Control"))
	}
	var body userResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.User != user {
		t.Fatalf("body = %s, want %+v", rec.Body.String(), user)
	}
	assertJSONStatus(t, getMe(t, store, ""), http.StatusUnauthorized, "not signed in")
}

// Every auth endpoint answers no-store, whatever the outcome - also 405 and 404.
func TestAuthRoutes_neverCached(t *testing.T) {
	store := newFakeAuth()
	for _, req := range []*http.Request{
		sameOriginRequest(http.MethodGet, "/api/auth/login", nil),
		sameOriginRequest(http.MethodPost, "/api/auth/me", nil),
		sameOriginRequest(http.MethodPost, "/api/auth/unknown", nil),
		sameOriginRequest(http.MethodPost, "/api/auth/login", strings.NewReader("{}")),
		sameOriginRequest(http.MethodPost, "/api/auth/demo", nil),
		httptest.NewRequest(http.MethodGet, "/api/auth/me", nil),
	} {
		rec := httptest.NewRecorder()
		NewRouter(Deps{Auth: store}).ServeHTTP(rec, req)
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s %s -> %d, Cache-Control %q, want no-store", req.Method, req.URL.Path, rec.Code, got)
		}
	}
}

// The catalog stays public-cacheable and never looks at the session cookie:
// a cached answer must be the same for every visitor.
func TestCatalog_ignoresTheSessionCookie(t *testing.T) {
	store := newFakeAuth()
	_, token := store.signedIn(t, "me@example.com")
	r := httptest.NewRequest(http.MethodGet, "/api/products", nil)
	r.AddCookie(&http.Cookie{Name: "session", Value: token})
	rec := httptest.NewRecorder()
	NewRouter(Deps{Catalog: &fakeCatalog{}, Auth: store}).ServeHTTP(rec, r)
	if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != listCache {
		t.Fatalf("status %d, Cache-Control %q, want 200 and %q", rec.Code, rec.Header().Get("Cache-Control"), listCache)
	}
	if store.calls != 0 || rec.Header().Get("Set-Cookie") != "" || rec.Header().Get("Vary") != "" {
		t.Fatal("the catalog must not read or set the session")
	}
}
