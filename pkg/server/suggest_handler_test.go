package server

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
)

const suggestCache = "public, s-maxage=300, stale-while-revalidate=600"

func TestSuggest_ok(t *testing.T) {
	price := int64(1099)
	cover := "https://img.example/gta.jpg"
	alias := "GTA 5"
	fake := &fakeCatalog{suggestions: []catalog.Suggestion{
		{GameTitle: "Grand Theft Auto V", ProductSlug: "grand-theft-auto-v-steam-global",
			Platform: catalog.Ref{Slug: "steam", Name: "Steam"}, Region: catalog.Ref{Slug: "global", Name: "GLOBAL"},
			CoverURL: &cover, PriceCents: &price, InStock: true, MatchedAlias: &alias},
		{GameTitle: "Grand Theft Auto IV", ProductSlug: "grand-theft-auto-iv-steam-global",
			Platform: catalog.Ref{Slug: "steam", Name: "Steam"}, Region: catalog.Ref{Slug: "global", Name: "GLOBAL"}},
	}}
	rec := get(t, fake, "/api/search/suggest?q=%20gta%20%205%20")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Cache-Control"); got != suggestCache {
		t.Errorf("Cache-Control = %q, want %q", got, suggestCache)
	}
	if fake.gotQuery != "gta 5" {
		t.Errorf("store got q %q, want the normalized %q", fake.gotQuery, "gta 5")
	}

	// The exact JSON contract Task 13b builds against.
	items := decode(t, rec)["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("want 2 items, got %d", len(items))
	}
	want := map[string]any{
		"gameTitle": "Grand Theft Auto V", "productSlug": "grand-theft-auto-v-steam-global",
		"platform": map[string]any{"slug": "steam", "name": "Steam"},
		"region":   map[string]any{"slug": "global", "name": "GLOBAL"},
		"coverUrl": cover, "priceCents": float64(1099), "inStock": true, "matchedAlias": "GTA 5",
	}
	if !reflect.DeepEqual(items[0], want) {
		t.Errorf("item 0 =\n%v\nwant\n%v", items[0], want)
	}
	// Out of stock / no alias / no cover: the keys are present with null, never omitted.
	second := items[1].(map[string]any)
	for _, key := range []string{"coverUrl", "priceCents", "matchedAlias"} {
		if v, ok := second[key]; !ok || v != nil {
			t.Errorf("item 1 %s = %v (present: %v), want null", key, v, ok)
		}
	}
	if second["inStock"] != false {
		t.Errorf("item 1 inStock = %v, want false", second["inStock"])
	}
}

func TestSuggest_noMatchesIsAnEmptyList(t *testing.T) {
	rec := get(t, &fakeCatalog{suggestions: []catalog.Suggestion{}}, "/api/search/suggest?q=qwertyzz")
	if rec.Code != http.StatusOK || rec.Body.String() != "{\"items\":[]}\n" {
		t.Fatalf("got %d %s, want 200 {\"items\":[]}", rec.Code, rec.Body.String())
	}
}

func TestSuggest_badRequest(t *testing.T) {
	tests := map[string]string{
		"/api/search/suggest":                "q is required (2 to 100 characters)",
		"/api/search/suggest?q=":             "q is required (2 to 100 characters)",
		"/api/search/suggest?q=a":            qLengthMsg,
		"/api/search/suggest?q=%20%20":       qLengthMsg,
		"/api/search/suggest?q=gta&q=rdr2":   "q must be given once",
		"/api/search/suggest?q=" + long(101): qLengthMsg,
	}
	for target, msg := range tests {
		t.Run(target, func(t *testing.T) {
			fake := &fakeCatalog{}
			rec := get(t, fake, target)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", rec.Code)
			}
			if got := rec.Header().Get("Cache-Control"); got != "no-store" {
				t.Errorf("Cache-Control = %q, want no-store", got)
			}
			if got := decode(t, rec)["error"]; got != msg {
				t.Errorf("error = %v, want %q", got, msg)
			}
			if fake.calls != 0 {
				t.Error("the store must not be called for an invalid request")
			}
		})
	}
}

func long(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = 'a'
	}
	return string(b)
}

func TestSuggest_errors(t *testing.T) {
	for name, err := range unreachableErrors() {
		t.Run("503 "+name, func(t *testing.T) {
			assertUnavailable(t, get(t, &fakeCatalog{err: err}, "/api/search/suggest?q=gta"))
		})
	}
	t.Run("503 no catalog configured (nil)", func(t *testing.T) {
		assertUnavailable(t, get(t, nil, "/api/search/suggest?q=gta"))
	})
	for name, err := range unexpectedErrors() {
		t.Run("500 "+name, func(t *testing.T) {
			assertInternalError(t, get(t, &fakeCatalog{err: err}, "/api/search/suggest?q=gta"))
		})
	}
}

func TestSuggest_methodNotAllowed(t *testing.T) {
	rec := httptest.NewRecorder()
	NewRouter(Deps{Catalog: &fakeCatalog{}}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/search/suggest?q=gta", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST = %d, want 405", rec.Code)
	}
}

// The listing passes the normalized q and the relevance default to the store.
func TestProductsList_searchReachesTheStore(t *testing.T) {
	fake := &fakeCatalog{page: catalog.Page{Items: []catalog.Item{}}}
	rec := get(t, fake, "/api/products?q=%20eldn%20%20ring&platform=steam")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if fake.gotFilter.Query != "eldn ring" || fake.gotFilter.Sort != catalog.SortRelevance ||
		!reflect.DeepEqual(fake.gotFilter.Platforms, []string{"steam"}) {
		t.Fatalf("filter = %+v", fake.gotFilter)
	}
}
