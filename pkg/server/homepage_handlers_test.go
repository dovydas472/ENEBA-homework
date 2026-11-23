package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
	"github.com/dovydas472/ENEBA-homework/pkg/homepage"
)

const homepageCache = "public, s-maxage=300, stale-while-revalidate=600"

// fakeHomepage is the test double for HomepageReader. The block logic itself (order, disabled
// blocks, live prices, row config) is tested in pkg/homepage; here only the HTTP rules are.
type fakeHomepage struct {
	registry  homepage.Registry
	hero      homepage.Hero
	tiles     homepage.Tiles
	platforms homepage.Platforms
	row       homepage.ProductRow
	err       error
	gotKey    string
}

func (f *fakeHomepage) Registry(context.Context) (homepage.Registry, error) { return f.registry, f.err }
func (f *fakeHomepage) Hero(context.Context) (homepage.Hero, error)         { return f.hero, f.err }
func (f *fakeHomepage) Tiles(context.Context) (homepage.Tiles, error)       { return f.tiles, f.err }
func (f *fakeHomepage) Platforms(context.Context) (homepage.Platforms, error) {
	return f.platforms, f.err
}
func (f *fakeHomepage) ProductRow(_ context.Context, key string) (homepage.ProductRow, error) {
	f.gotKey = key
	return f.row, f.err
}

func homeGet(t *testing.T, h HomepageReader, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	NewRouter(Deps{Homepage: h}).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, nil))
	return rec
}

var homepagePaths = []string{
	"/api/homepage", "/api/blocks/hero", "/api/blocks/tiles", "/api/blocks/platforms", "/api/blocks/products/discounts",
}

func TestHomepage_registryIsCachedAndKeepsOrder(t *testing.T) {
	f := &fakeHomepage{registry: homepage.Registry{Blocks: []homepage.RegistryEntry{
		{Key: "hero", Type: "hero", Title: "Featured", Endpoint: "/api/blocks/hero"},
		{Key: "discounts", Type: "product_row", Title: "Biggest discounts", Endpoint: "/api/blocks/products/discounts"},
	}}}
	rec := homeGet(t, f, "/api/homepage")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Cache-Control"); got != homepageCache {
		t.Errorf("Cache-Control = %q, want %q", got, homepageCache)
	}
	var body struct {
		Blocks []map[string]string `json:"blocks"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	want := []map[string]string{
		{"key": "hero", "type": "hero", "title": "Featured", "endpoint": "/api/blocks/hero"},
		{"key": "discounts", "type": "product_row", "title": "Biggest discounts", "endpoint": "/api/blocks/products/discounts"},
	}
	if !reflect.DeepEqual(body.Blocks, want) {
		t.Errorf("blocks = %v, want %v", body.Blocks, want)
	}
}

func TestHomepage_everyBlockEndpointAnswersCachedJSON(t *testing.T) {
	price := int64(1199)
	f := &fakeHomepage{
		registry:  homepage.Registry{Blocks: []homepage.RegistryEntry{}},
		hero:      homepage.Hero{Slides: []homepage.HeroSlide{{ID: 2, Title: "GTA V", PriceCents: &price, CTA: &homepage.Link{Label: "Buy now", Href: "/product/gta"}}}},
		tiles:     homepage.Tiles{Tiles: []homepage.TileCard{{ID: 1, Title: "Steam games", Href: "/store?platform=steam", CoverURLs: []string{}}}},
		platforms: homepage.Platforms{Items: []homepage.PlatformLink{{Key: "all", Label: "All games", Count: 3, Href: "/store", Icon: "layout-grid"}}},
		row:       homepage.ProductRow{Items: []catalog.Item{sampleItem()}, ViewAllHref: "/store?sort=discount"},
	}
	for _, path := range homepagePaths {
		t.Run(path, func(t *testing.T) {
			rec := homeGet(t, f, path)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
			}
			if got := rec.Header().Get("Cache-Control"); got != homepageCache {
				t.Errorf("Cache-Control = %q", got)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q", ct)
			}
		})
	}

	// The product row receives its {key}, and the hero's live price is in the JSON as integer cents.
	homeGet(t, f, "/api/blocks/products/new-releases")
	if f.gotKey != "new-releases" {
		t.Errorf("ProductRow got key %q, want new-releases", f.gotKey)
	}
	body := decode(t, homeGet(t, f, "/api/blocks/hero"))
	slide := body["slides"].([]any)[0].(map[string]any)
	if slide["priceCents"] != float64(1199) || slide["cta"].(map[string]any)["href"] != "/product/gta" {
		t.Errorf("slide = %v", slide)
	}
}

// Disabled or unknown block -> 404, never cached (turning it on again must show at once).
func TestHomepage_notFoundIs404(t *testing.T) {
	for _, path := range homepagePaths {
		t.Run(path, func(t *testing.T) {
			rec := homeGet(t, &fakeHomepage{err: homepage.ErrNotFound}, path)
			if rec.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404", rec.Code)
			}
			if got := rec.Header().Get("Cache-Control"); got != "no-store" {
				t.Errorf("Cache-Control = %q, want no-store", got)
			}
		})
	}
}

func TestHomepage_dbUnavailableIs503(t *testing.T) {
	for _, path := range homepagePaths {
		for name, err := range unreachableErrors() {
			t.Run(path+"/"+name, func(t *testing.T) {
				assertUnavailable(t, homeGet(t, &fakeHomepage{err: err}, path))
			})
		}
		t.Run(path+"/no service configured", func(t *testing.T) {
			assertUnavailable(t, homeGet(t, nil, path))
		})
	}
}

// A SQL error or a broken config in the table is a bug: 500, generic message, nothing leaked.
func TestHomepage_unexpectedErrorIs500(t *testing.T) {
	for _, path := range homepagePaths {
		for name, err := range unexpectedErrors() {
			t.Run(path+"/"+name, func(t *testing.T) {
				assertInternalError(t, homeGet(t, &fakeHomepage{err: err}, path))
			})
		}
	}
}

func TestHomepage_otherMethodsAre405(t *testing.T) {
	for _, path := range homepagePaths {
		rec := httptest.NewRecorder()
		// Same-origin, so it passes the CSRF check (origin.go) and reaches the 405.
		NewRouter(Deps{Homepage: &fakeHomepage{}}).ServeHTTP(rec, sameOriginRequest(http.MethodPost, path, nil))
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("POST %s = %d, want 405", path, rec.Code)
		}
	}
}
