package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// sameOriginRequest is httptest.NewRequest plus the Origin header a browser
// sends from our own page (httptest's Host is "example.com"), so a POST passes
// the CSRF check and reaches the handler under test.
func sameOriginRequest(method, target string, body io.Reader) *http.Request {
	r := httptest.NewRequest(method, target, body)
	r.Header.Set("Origin", "http://"+r.Host)
	return r
}

func TestRequireSameOrigin(t *testing.T) {
	cases := []struct {
		name      string
		method    string
		host      string
		forwarded string // X-Forwarded-Host
		origin    string // "" = no Origin header
		want      int
	}{
		{"same host", "POST", "shop.example", "", "https://shop.example", http.StatusOK},
		{"same host with port (local Vite)", "POST", "127.0.0.1:5173", "", "http://127.0.0.1:5173", http.StatusOK},
		{"host compared without case", "POST", "Shop.Example", "", "https://shop.example", http.StatusOK},
		{"foreign origin", "POST", "shop.example", "", "https://evil.example", http.StatusForbidden},
		{"look-alike suffix", "POST", "shop.example", "", "https://shop.example.evil.example", http.StatusForbidden},
		{"other port", "POST", "127.0.0.1:5173", "", "http://127.0.0.1:8080", http.StatusForbidden},
		{"missing origin", "POST", "shop.example", "", "", http.StatusForbidden},
		{"origin null", "POST", "shop.example", "", "null", http.StatusForbidden},
		{"origin not a URL", "POST", "shop.example", "", "::::", http.StatusForbidden},
		{"PUT checked", "PUT", "shop.example", "", "https://evil.example", http.StatusForbidden},
		{"PATCH checked", "PATCH", "shop.example", "", "", http.StatusForbidden},
		{"DELETE checked", "DELETE", "shop.example", "", "", http.StatusForbidden},
		// On Vercel the function sees its internal host; the browser's host is in X-Forwarded-Host.
		{"forwarded host matches", "POST", "internal.vercel", "app.vercel.app", "https://app.vercel.app", http.StatusOK},
		{"forwarded host wins over Host", "POST", "app.vercel.app", "other.vercel.app", "https://app.vercel.app", http.StatusForbidden},
		{"forwarded list: first is used", "POST", "internal", "app.vercel.app, proxy.internal", "https://app.vercel.app", http.StatusOK},
		{"forwarded host, foreign origin", "POST", "internal.vercel", "app.vercel.app", "https://evil.example", http.StatusForbidden},
		// Reading is never blocked: GET/HEAD/OPTIONS do not change anything.
		{"GET without origin", "GET", "shop.example", "", "", http.StatusOK},
		{"GET with foreign origin", "GET", "shop.example", "", "https://evil.example", http.StatusOK},
		{"HEAD without origin", "HEAD", "shop.example", "", "", http.StatusOK},
		{"OPTIONS without origin", "OPTIONS", "shop.example", "", "", http.StatusOK},
	}
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := httptest.NewRequest(c.method, "/api/auth/login", nil)
			r.Host = c.host
			if c.forwarded != "" {
				r.Header.Set("X-Forwarded-Host", c.forwarded)
			}
			if c.origin != "" {
				r.Header.Set("Origin", c.origin)
			}
			rec := httptest.NewRecorder()
			requireSameOrigin(ok).ServeHTTP(rec, r)
			if rec.Code != c.want {
				t.Fatalf("status = %d, want %d", rec.Code, c.want)
			}
			if c.want == http.StatusForbidden {
				assertJSONError(t, rec, "cross-origin request blocked")
			}
		})
	}
}

// The router applies the check to every endpoint, including ones added later.
func TestRouter_blocksCrossOriginPost(t *testing.T) {
	store := newFakeAuth()
	for _, path := range []string{"/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/auth/demo", "/api/anything-new"} {
		r := httptest.NewRequest(http.MethodPost, path, nil)
		r.Header.Set("Origin", "https://evil.example")
		rec := httptest.NewRecorder()
		NewRouter(Deps{Auth: store}).ServeHTTP(rec, r)
		if rec.Code != http.StatusForbidden {
			t.Errorf("POST %s with a foreign Origin = %d, want 403", path, rec.Code)
		}
	}
	if store.calls != 0 {
		t.Fatalf("the store was called %d times; a blocked request must not reach a handler", store.calls)
	}
}
