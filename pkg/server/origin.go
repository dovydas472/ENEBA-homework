package server

import (
	"net/http"
	"net/url"
	"strings"
)

// requireSameOrigin is the CSRF protection (owner decision A5), applied to the
// whole API in NewRouter. Every state-changing request (POST, PUT, PATCH,
// DELETE) must carry an Origin header whose host is our own host; a missing or
// foreign Origin gets 403 before any handler runs. GET/HEAD/OPTIONS pass: they
// must never change anything, so there is nothing to forge.
//
// Why both this and SameSite=Lax on the cookie:
//   - CSRF = another website makes the visitor's browser send a request to our
//     API; the browser would attach our session cookie automatically.
//   - SameSite=Lax already stops the cookie on cross-site POSTs in modern
//     browsers. The Origin check is the second, independent layer: browsers
//     always send Origin on POST (and a page cannot fake it), so a request that
//     came from another site is recognised even if a browser ignored SameSite.
//     It also blocks "login CSRF" (signing the visitor in to the attacker's
//     account), where no cookie is involved at all.
func requireSameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isStateChanging(r.Method) && !sameOrigin(r) {
			writeError(w, http.StatusForbidden, "cross-origin request blocked")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isStateChanging(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	}
	return false
}

// sameOrigin reports whether the Origin header names the host this request was sent to.
// "null" (sandboxed pages, some redirects) and anything unparsable count as foreign.
func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	return strings.EqualFold(u.Host, requestHost(r))
}

// requestHost is the host the BROWSER used ("shop.example.com", "127.0.0.1:5173").
//
// On Vercel the request reaches the function through Vercel's proxy, which puts
// the original host into X-Forwarded-Host (owner decision A5: "use the forwarded
// host"). Locally there is no such header (the Vite proxy keeps the browser's
// Host header), so r.Host is used.
//
// Trusting X-Forwarded-Host is safe for THIS check: a page on another site
// cannot make the visitor's browser send a custom X-Forwarded-Host header
// (that needs a CORS pre-flight, which this API never allows). A script or curl
// can send anything - but it has no visitor's cookie to abuse, so it is not CSRF.
func requestHost(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" {
		// A chain of proxies may send "a, b": the first one is the browser's.
		first, _, _ := strings.Cut(fwd, ",")
		return strings.TrimSpace(first)
	}
	return r.Host
}
