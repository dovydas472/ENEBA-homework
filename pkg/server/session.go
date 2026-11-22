package server

import (
	"context"
	"errors"
	"net/http"

	"github.com/dovydas472/ENEBA-homework/pkg/auth"
)

// sessionCookieName is the name of the cookie that carries the session token.
const sessionCookieName = "session"

// sessionCookie builds the Set-Cookie for a new session (owner decision A3):
//   - HttpOnly: JavaScript cannot read it, so an XSS bug cannot steal the token.
//   - Secure: only sent over HTTPS. (Browsers treat http://127.0.0.1 and
//     http://localhost as secure too, so local development still works.)
//   - SameSite=Lax: not sent on cross-site POST/fetch requests (CSRF), but
//     still sent when the user follows a normal link to us from another site.
//   - Path=/: valid for the whole site.
//   - Max-Age = 7 days, the same as the session row's expires_at.
func sessionCookie(token string) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(auth.SessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	}
}

// clearedSessionCookie tells the browser to delete the cookie: same name and
// attributes, empty value, Max-Age=0 (Go writes MaxAge -1 as "Max-Age=0").
func clearedSessionCookie() *http.Cookie {
	c := sessionCookie("")
	c.MaxAge = -1
	return c
}

// sessionTokenHash reads the session cookie of a request and returns the hash
// to look up. ok is false when there is no cookie or it is not a token we could
// have issued (then the database is not asked at all).
func sessionTokenHash(r *http.Request) (hash []byte, ok bool) {
	c, err := r.Cookie(sessionCookieName)
	if err != nil {
		return nil, false
	}
	return auth.HashSessionToken(c.Value)
}

// SessionReader is everything the "who is signed in" helpers need from the
// data layer. *auth.Store implements it; tests use a fake.
type SessionReader interface {
	UserBySession(ctx context.Context, tokenHash []byte) (auth.User, error)
}

// currentUser loads the signed-in user from the request's session cookie.
// No cookie, a malformed one, an unknown or an expired session all return
// auth.ErrNoSession. Any other error is a database problem (503/500).
// Later tasks (checkout, orders) call it through requireUser.
func currentUser(ctx context.Context, sessions SessionReader, r *http.Request) (auth.User, error) {
	hash, ok := sessionTokenHash(r)
	if !ok {
		return auth.User{}, auth.ErrNoSession
	}
	return sessions.UserBySession(ctx, hash)
}

// userHandler is a handler for a protected endpoint: it gets the signed-in user as an argument.
type userHandler func(w http.ResponseWriter, r *http.Request, user auth.User)

// requireUser protects an endpoint: the wrapped handler only runs for a
// signed-in user. Not signed in -> 401 {"error":"not signed in"};
// database down -> 503, other DB error -> 500 (generic messages, details in the log).
// Responses of protected endpoints contain user data, so they are never cached.
func requireUser(sessions SessionReader, next userHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if sessions == nil {
			unavailable(w, "load session", errors.New("no auth store configured"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		user, err := currentUser(ctx, sessions, r)
		if errors.Is(err, auth.ErrNoSession) {
			writeError(w, http.StatusUnauthorized, "not signed in")
			return
		}
		if err != nil {
			storeFailed(w, "load session", err)
			return
		}
		next(w, r.WithContext(ctx), user)
	}
}
