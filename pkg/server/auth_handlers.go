package server

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/dovydas472/ENEBA-homework/pkg/auth"
)

// The auth endpoints depend on three small interfaces, grouped by job, instead
// of on *auth.Store itself (same idea as CatalogReader): handler tests plug in
// a fake, and the handlers never see pgx.

// AccountStore creates and finds accounts.
type AccountStore interface {
	CreateUser(ctx context.Context, email, passwordHash string) (auth.User, error)
	CreateDemoUser(ctx context.Context) (auth.User, error)
	UserByEmail(ctx context.Context, email string) (user auth.User, passwordHash string, err error)
}

// SessionStore creates, reads and deletes sessions.
type SessionStore interface {
	SessionReader
	CreateSession(ctx context.Context, userID int64, tokenHash []byte) error
	DeleteSession(ctx context.Context, tokenHash []byte) error
}

// LoginLimiter is the failed sign-in counter (rate limit, owner decision A6).
type LoginLimiter interface {
	LoginBlocked(ctx context.Context, email string) (retryAfter time.Duration, blocked bool, err error)
	RecordLoginFailure(ctx context.Context, email string) error
	ClearLoginFailures(ctx context.Context, email string) error
}

// AuthStore is all three together. *auth.Store implements it.
type AuthStore interface {
	AccountStore
	SessionStore
	LoginLimiter
}

// Messages the user sees. The sign-in failure is ONE text for every reason
// (unknown email, wrong password, demo account): the answer must not reveal
// which emails have an account (owner decision A7).
const (
	msgInvalidLogin = "Invalid email or password"
	msgEmailTaken   = "An account with this email already exists"
	msgTooMany      = "Too many failed sign-in attempts. Try again later."
	msgBadBody      = "Request body must be JSON: {\"email\": \"...\", \"password\": \"...\"}"
)

// maxAuthBody caps the request body: an email and a password fit easily in
// 4 KiB, and a bigger body is rejected before it is read into memory.
const maxAuthBody = 4 << 10

// credentials is the JSON body of register and login.
type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// userResponse is the body of every auth endpoint that returns the user:
// {"user": {"id": 1, "email": "...", "isDemo": false}}. An object (not the bare
// user) so fields can be added later without breaking clients.
type userResponse struct {
	User auth.User `json:"user"`
}

// noStore marks every /api/auth/* response as "never cache": they contain the
// user's data or set the session cookie. A CDN or the browser cache must never
// hand one user's answer to another request.
func noStore(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next(w, r)
	}
}

// readCredentials decodes {email, password}. On a bad body it answers 400 and returns false.
func readCredentials(w http.ResponseWriter, r *http.Request) (credentials, bool) {
	var c credentials
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxAuthBody)).Decode(&c); err != nil {
		writeError(w, http.StatusBadRequest, msgBadBody)
		return credentials{}, false
	}
	return c, true
}

// badInput answers 400 with the text of a validation error (written for the user).
func badInput(w http.ResponseWriter, err error) {
	writeError(w, http.StatusBadRequest, err.Error())
}

// startSession signs the user in on this browser: a new random token, its hash
// stored in the database, the token itself in the cookie. If the browser
// already had a session (e.g. a demo user who now signs in), that old session
// is deleted, so one browser never holds two live sessions.
func startSession(ctx context.Context, w http.ResponseWriter, r *http.Request, sessions SessionStore, user auth.User) error {
	token, hash, err := auth.NewSessionToken()
	if err != nil {
		return err
	}
	if err := sessions.CreateSession(ctx, user.ID, hash); err != nil {
		return err
	}
	if old, ok := sessionTokenHash(r); ok {
		if err := sessions.DeleteSession(ctx, old); err != nil {
			// Not fatal: the old session still expires on its own.
			log.Printf("auth: could not delete the previous session: %v", err)
		}
	}
	http.SetCookie(w, sessionCookie(token))
	return nil
}

// registerHandler serves POST /api/auth/register {email, password}.
//   - 201 {user} + session cookie: account created and signed in
//   - 400 invalid email / password (8-128 characters) / body
//   - 409 the email already has an account (unavoidable on sign-up, A7)
func registerHandler(store AuthStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		creds, ok := readCredentials(w, r)
		if !ok {
			return
		}
		email, err := auth.ValidateNewEmail(creds.Email)
		if err != nil {
			badInput(w, err)
			return
		}
		if err := auth.ValidateNewPassword(creds.Password); err != nil {
			badInput(w, err)
			return
		}
		if store == nil {
			unavailable(w, "register", errors.New("no auth store configured"))
			return
		}

		hash, err := auth.HashPassword(creds.Password)
		if err != nil {
			internalError(w, "register: hash password", err)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		user, err := store.CreateUser(ctx, email, hash)
		if errors.Is(err, auth.ErrEmailTaken) {
			writeError(w, http.StatusConflict, msgEmailTaken)
			return
		}
		if err != nil {
			storeFailed(w, "register", err)
			return
		}
		if err := startSession(ctx, w, r, store, user); err != nil {
			storeFailed(w, "register: start session", err)
			return
		}
		writeJSON(w, http.StatusCreated, userResponse{User: user})
	}
}

// loginHandler serves POST /api/auth/login {email, password}.
//   - 200 {user} + session cookie
//   - 400 missing/invalid input
//   - 401 "Invalid email or password" - the same text for every reason (A7)
//   - 429 + Retry-After: 10 failures for this email in the current 15 minutes (A6)
//
// Timing (A2): an unknown email (or a demo account) still costs one argon2id
// check, so a quick 401 cannot reveal that the email has no account.
func loginHandler(store AuthStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		creds, ok := readCredentials(w, r)
		if !ok {
			return
		}
		email, err := auth.NormalizeEmail(creds.Email)
		if err != nil {
			badInput(w, err)
			return
		}
		if err := auth.ValidateLoginPassword(creds.Password); err != nil {
			badInput(w, err)
			return
		}
		if store == nil {
			unavailable(w, "login", errors.New("no auth store configured"))
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()

		// 1. Rate limit first: a blocked email is not even checked, so guessing stops.
		retryAfter, blocked, err := store.LoginBlocked(ctx, email)
		if err != nil {
			storeFailed(w, "login: rate limit", err)
			return
		}
		if blocked {
			w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retryAfter.Seconds()))))
			writeError(w, http.StatusTooManyRequests, msgTooMany)
			return
		}

		// 2. Find the account. "Not found" is not an error here: it continues
		// into the same password check as a wrong password.
		user, hash, err := store.UserByEmail(ctx, email)
		if err != nil && !errors.Is(err, auth.ErrUserNotFound) {
			storeFailed(w, "login: find user", err)
			return
		}

		// 3. Check the password - or burn the same work when there is nothing to check.
		if !passwordMatches(hash, creds.Password) {
			if err := store.RecordLoginFailure(ctx, email); err != nil {
				storeFailed(w, "login: record failure", err)
				return
			}
			writeError(w, http.StatusUnauthorized, msgInvalidLogin)
			return
		}

		// 4. Success: forget the failures (A6) and sign in.
		if err := store.ClearLoginFailures(ctx, email); err != nil {
			storeFailed(w, "login: clear failures", err)
			return
		}
		if err := startSession(ctx, w, r, store, user); err != nil {
			storeFailed(w, "login: start session", err)
			return
		}
		writeJSON(w, http.StatusOK, userResponse{User: user})
	}
}

// passwordMatches checks a password against a stored hash. An empty hash
// (unknown email, demo account) or a malformed one never matches, but still
// costs one full argon2id check - the timing is the same on every path.
func passwordMatches(storedHash, password string) bool {
	if storedHash == "" {
		auth.BurnPasswordCheck(password)
		return false
	}
	ok, err := auth.VerifyPassword(storedHash, password)
	if err != nil {
		log.Printf("auth: stored password hash is malformed: %v", err)
		auth.BurnPasswordCheck(password)
		return false
	}
	return ok
}

// logoutHandler serves POST /api/auth/logout -> 204, cookie cleared.
// Signing out when already signed out is fine (still 204). The cookie is
// cleared even if the database is down, so this browser is signed out either way;
// the error is then reported (503/500), because the session row may still exist.
func logoutHandler(store AuthStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, clearedSessionCookie())
		hash, ok := sessionTokenHash(r)
		if ok && store != nil {
			ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
			defer cancel()
			if err := store.DeleteSession(ctx, hash); err != nil {
				storeFailed(w, "logout", err)
				return
			}
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// demoHandler serves POST /api/auth/demo -> 201 {user} + cookie: a brand-new
// demo account (A4), signed in at once. No input, nothing to validate.
func demoHandler(store AuthStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			unavailable(w, "demo", errors.New("no auth store configured"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		user, err := store.CreateDemoUser(ctx)
		if err != nil {
			storeFailed(w, "demo: create user", err)
			return
		}
		if err := startSession(ctx, w, r, store, user); err != nil {
			storeFailed(w, "demo: start session", err)
			return
		}
		writeJSON(w, http.StatusCreated, userResponse{User: user})
	}
}

// meHandler serves GET /api/auth/me -> 200 {user} or 401 (requireUser does the 401).
func meHandler(w http.ResponseWriter, _ *http.Request, user auth.User) {
	writeJSON(w, http.StatusOK, userResponse{User: user})
}
