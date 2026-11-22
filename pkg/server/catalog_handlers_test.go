package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
	"github.com/dovydas472/ENEBA-homework/pkg/db"
)

const (
	listCache    = "public, s-maxage=60, stale-while-revalidate=300"
	productCache = "public, s-maxage=15, stale-while-revalidate=60"
)

// fakeCatalog is the test double for CatalogReader: tests choose what it
// returns and can see which filter / slug the handler passed in.
type fakeCatalog struct {
	page      catalog.Page
	detail    catalog.ProductDetail
	err       error
	calls     int
	gotFilter catalog.Filter
	gotSlug   string
}

func (f *fakeCatalog) ListProducts(_ context.Context, flt catalog.Filter) (catalog.Page, error) {
	f.calls++
	f.gotFilter = flt
	return f.page, f.err
}

func (f *fakeCatalog) GetProduct(_ context.Context, slug string) (catalog.ProductDetail, error) {
	f.calls++
	f.gotSlug = slug
	return f.detail, f.err
}

func get(t *testing.T, c CatalogReader, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	NewRouter(Deps{Catalog: c}).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, nil))
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not JSON: %v\n%s", err, rec.Body.String())
	}
	return body
}

func sampleItem() catalog.Item {
	price, msrp, disc := int64(1099), int64(3999), int64(72)
	cover := "https://img.example/x.jpg"
	return catalog.Item{
		Slug: "the-witcher-3-wild-hunt-steam-global", Title: "The Witcher 3: Wild Hunt", Edition: "Standard",
		Platform: catalog.Ref{Slug: "steam", Name: "Steam"}, Region: catalog.Ref{Slug: "global", Name: "GLOBAL"},
		CoverURL: &cover, PriceCents: &price, MSRPCents: &msrp, DiscountPercent: &disc, OfferCount: 4, InStock: true,
		CheapestOffer: &catalog.CheapestOffer{OfferID: 17, Stock: 6, SellerName: "Retro Ridge"},
	}
}

func TestProductsList_ok(t *testing.T) {
	fake := &fakeCatalog{page: catalog.Page{
		Items: []catalog.Item{sampleItem()}, Total: 108, Page: 2, PageSize: 24,
		Facets: catalog.Facets{
			Platforms:  []catalog.FacetOption{{Slug: "steam", Name: "Steam", Count: 54}},
			Regions:    []catalog.FacetOption{{Slug: "global", Name: "GLOBAL", Count: 80}},
			PriceRange: &catalog.PriceRange{MinCents: 199, MaxCents: 5999},
		},
	}}
	rec := get(t, fake, "/api/products?platform=steam,psn&sort=price_asc&page=2")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != listCache {
		t.Errorf("Cache-Control = %q, want %q", got, listCache)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q", ct)
	}

	// The handler passes the PARSED filter to the store.
	want := catalog.Filter{Platforms: []string{"steam", "psn"}, Sort: catalog.SortPriceAsc, Page: 2, PageSize: 24}
	if !reflect.DeepEqual(fake.gotFilter, want) {
		t.Errorf("filter = %+v, want %+v", fake.gotFilter, want)
	}

	// JSON shape: camelCase names exactly as documented.
	body := decode(t, rec)
	for _, k := range []string{"items", "total", "page", "pageSize", "facets"} {
		if _, ok := body[k]; !ok {
			t.Errorf("missing top-level key %q", k)
		}
	}
	item := body["items"].([]any)[0].(map[string]any)
	wantItem := map[string]any{
		"slug": "the-witcher-3-wild-hunt-steam-global", "title": "The Witcher 3: Wild Hunt", "edition": "Standard",
		"platform": map[string]any{"slug": "steam", "name": "Steam"},
		"region":   map[string]any{"slug": "global", "name": "GLOBAL"},
		"coverUrl": "https://img.example/x.jpg", "priceCents": 1099.0, "msrpCents": 3999.0, "discountPercent": 72.0,
		"offerCount": 4.0, "inStock": true,
		// The offer a card's "Add to cart" adds (Task 12).
		"cheapestOffer": map[string]any{"offerId": 17.0, "stock": 6.0, "sellerName": "Retro Ridge"},
	}
	if !reflect.DeepEqual(item, wantItem) {
		t.Errorf("item = %v\nwant   %v", item, wantItem)
	}
	facets := body["facets"].(map[string]any)
	if !reflect.DeepEqual(facets["priceRange"], map[string]any{"minCents": 199.0, "maxCents": 5999.0}) {
		t.Errorf("priceRange = %v", facets["priceRange"])
	}
	firstPlatform := facets["platforms"].([]any)[0]
	if !reflect.DeepEqual(firstPlatform, map[string]any{"slug": "steam", "name": "Steam", "count": 54.0}) {
		t.Errorf("platform facet = %v", firstPlatform)
	}
	if body["total"] != 108.0 || body["page"] != 2.0 || body["pageSize"] != 24.0 {
		t.Errorf("paging fields wrong: %v %v %v", body["total"], body["page"], body["pageSize"])
	}
}

func TestProductsList_nullsAndEmptyLists(t *testing.T) {
	// Out-of-stock item: price and discount are JSON null; nothing is omitted.
	oos := catalog.Item{Slug: "x", Title: "X", Edition: "Standard"}
	fake := &fakeCatalog{page: catalog.Page{Items: []catalog.Item{oos}, Total: 1, Page: 1, PageSize: 24}}
	body := decode(t, get(t, fake, "/api/products"))
	item := body["items"].([]any)[0].(map[string]any)
	for _, k := range []string{"priceCents", "msrpCents", "discountPercent", "coverUrl", "cheapestOffer"} {
		if v, present := item[k]; !present || v != nil {
			t.Errorf("%s: want present and null, got %v (present=%v)", k, v, present)
		}
	}
	if item["inStock"] != false {
		t.Errorf("inStock = %v", item["inStock"])
	}
}

func TestProductsList_badRequest(t *testing.T) {
	tests := []struct{ query, msg string }{
		{"sort=cheapest", "sort must be one of popularity, price_asc, price_desc, discount, newest, title"},
		{"minPrice=2000&maxPrice=1000", "minPrice must not be greater than maxPrice"},
		{"pageSize=100", "pageSize must be an integer between 1 and 48"},
	}
	for _, tc := range tests {
		t.Run(tc.query, func(t *testing.T) {
			fake := &fakeCatalog{}
			rec := get(t, fake, "/api/products?"+tc.query)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", rec.Code)
			}
			if got := rec.Header().Get("Cache-Control"); got != "no-store" {
				t.Errorf("Cache-Control = %q, want no-store", got)
			}
			if got := decode(t, rec)["error"]; got != tc.msg {
				t.Errorf("error = %v, want %q", got, tc.msg)
			}
			if fake.calls != 0 {
				t.Errorf("the store must not be called for an invalid request")
			}
		})
	}
}

const secret = "postgres://user:s3cret@host-pooler.example/db"

// Errors that mean "the database cannot be reached": infrastructure -> 503.
func unreachableErrors() map[string]error {
	return map[string]error{
		"connect failed after the retry": fmt.Errorf("catalog: %w: dial %s: connection refused", db.ErrUnavailable, secret),
		"DATABASE_URL not set":           db.ErrNotConfigured,
		"DATABASE_URL invalid":           db.ErrBadConfig,
		"pool could not be created":      db.ErrPoolCreate,
		"connection dropped mid-query":   fmt.Errorf("read %s: %w", secret, pgconn.ErrConnClosed),
		"network error":                  &net.OpError{Op: "read", Err: errors.New("connection reset " + secret)},
	}
}

// Anything else unexpected - above all a SQL error - is a bug: developer -> 500.
func unexpectedErrors() map[string]error {
	return map[string]error{
		"SQL error (missing table)": fmt.Errorf("catalog: list items: %w", &pgconn.PgError{Code: "42P01", Message: `relation "products" does not exist`}),
		"scan error":                errors.New("scan: SELECT * FROM products: unsupported type " + secret),
		"query ran out of time":     fmt.Errorf("catalog: %w", context.DeadlineExceeded),
	}
}

func TestProductsList_dbUnavailable(t *testing.T) {
	for name, err := range unreachableErrors() {
		t.Run(name, func(t *testing.T) {
			assertUnavailable(t, get(t, &fakeCatalog{err: err}, "/api/products"))
		})
	}
	t.Run("no catalog configured (nil)", func(t *testing.T) {
		assertUnavailable(t, get(t, nil, "/api/products"))
	})
}

func TestProductsList_unexpectedErrorIs500(t *testing.T) {
	for name, err := range unexpectedErrors() {
		t.Run(name, func(t *testing.T) {
			assertInternalError(t, get(t, &fakeCatalog{err: err}, "/api/products"))
		})
	}
}

func assertUnavailable(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	assertGenericError(t, rec, http.StatusServiceUnavailable, "service temporarily unavailable")
}

func assertInternalError(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	assertGenericError(t, rec, http.StatusInternalServerError, "internal error")
}

// assertGenericError checks status, no-store and the generic body, and that
// nothing of the real cause reaches the client (it is only in the server log).
func assertGenericError(t *testing.T, rec *httptest.ResponseRecorder, status int, msg string) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d", rec.Code, status)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q", ct)
	}
	body := decode(t, rec)
	if got := body["error"]; got != msg {
		t.Errorf("error = %v, want %q", got, msg)
	}
	if len(body) != 1 {
		t.Errorf("body = %v, want only the \"error\" key", body)
	}
	for _, leak := range []string{"s3cret", "refused", "SELECT", "postgres://", "relation", "42P01", "deadline"} {
		if strings.Contains(rec.Body.String(), leak) {
			t.Errorf("response body leaks %q: %s", leak, rec.Body.String())
		}
	}
}

func sampleDetail() catalog.ProductDetail {
	price, msrp := int64(1099), int64(3999)
	rating := 7.38
	released, dev := "2015-05-19", "CD PROJEKT RED"
	return catalog.ProductDetail{
		Product: catalog.ProductInfo{Slug: "the-witcher-3-wild-hunt-steam-global", Edition: "Standard",
			Platform: catalog.Ref{Slug: "steam", Name: "Steam"}, Region: catalog.Ref{Slug: "global", Name: "GLOBAL"},
			MSRPCents: &msrp, PriceCents: &price, InStock: true},
		Game: catalog.GameInfo{Title: "The Witcher 3: Wild Hunt", Description: "An RPG.", Genres: []string{"RPG"},
			ReleaseDate: &released, Developer: &dev},
		Offers: []catalog.Offer{{OfferID: 15, PriceCents: 1099, Stock: 6, Seller: catalog.Seller{
			Slug: "retro-ridge", Name: "Retro Ridge", Rating: &rating, ReviewsCount: 212}}},
		Variants: []catalog.Variant{},
	}
}

func TestProductDetail_ok(t *testing.T) {
	fake := &fakeCatalog{detail: sampleDetail()}
	rec := get(t, fake, "/api/products/the-witcher-3-wild-hunt-steam-global")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != productCache {
		t.Errorf("Cache-Control = %q, want %q", got, productCache)
	}
	if fake.gotSlug != "the-witcher-3-wild-hunt-steam-global" {
		t.Errorf("slug passed to the store = %q", fake.gotSlug)
	}

	body := decode(t, rec)
	for _, k := range []string{"product", "game", "offers", "variants"} {
		if _, ok := body[k]; !ok {
			t.Errorf("missing top-level key %q", k)
		}
	}
	product := body["product"].(map[string]any)
	if product["priceCents"] != 1099.0 || product["inStock"] != true || product["msrpCents"] != 3999.0 {
		t.Errorf("product = %v", product)
	}
	game := body["game"].(map[string]any)
	if game["releaseDate"] != "2015-05-19" || game["publisher"] != nil || game["coverUrl"] != nil {
		t.Errorf("game = %v", game)
	}
	offer := body["offers"].([]any)[0].(map[string]any)
	seller := offer["seller"].(map[string]any)
	wantSeller := map[string]any{"slug": "retro-ridge", "name": "Retro Ridge", "rating": 7.38,
		"ratingLabel": nil, "isNew": false, "reviewsCount": 212.0}
	if !reflect.DeepEqual(seller, wantSeller) {
		t.Errorf("seller = %v\nwant     %v", seller, wantSeller)
	}
	if offer["offerId"] != 15.0 || offer["priceCents"] != 1099.0 || offer["stock"] != 6.0 {
		t.Errorf("offer = %v", offer)
	}
	if v, ok := body["variants"].([]any); !ok || len(v) != 0 {
		t.Errorf("variants must be an empty list, got %v", body["variants"])
	}
}

func TestProductDetail_notFound(t *testing.T) {
	// A wrapped ErrNotFound must still be recognised (errors.Is, not ==).
	fake := &fakeCatalog{err: fmt.Errorf("wrapped: %w", catalog.ErrNotFound)}
	rec := get(t, fake, "/api/products/no-such-product")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
	if got := decode(t, rec)["error"]; got != "product not found" {
		t.Errorf("error = %v", got)
	}
}

func TestProductDetail_dbUnavailable(t *testing.T) {
	for name, err := range unreachableErrors() {
		t.Run(name, func(t *testing.T) {
			assertUnavailable(t, get(t, &fakeCatalog{err: err}, "/api/products/x"))
		})
	}
	t.Run("no catalog configured (nil)", func(t *testing.T) {
		assertUnavailable(t, get(t, nil, "/api/products/x"))
	})
}

func TestProductDetail_unexpectedErrorIs500(t *testing.T) {
	for name, err := range unexpectedErrors() {
		t.Run(name, func(t *testing.T) {
			assertInternalError(t, get(t, &fakeCatalog{err: err}, "/api/products/x"))
		})
	}
}

func TestCatalogRoutes_methodsAndRemovedEndpoint(t *testing.T) {
	for _, path := range []string{"/api/products", "/api/products/some-slug"} {
		rec := httptest.NewRecorder()
		NewRouter(Deps{Catalog: &fakeCatalog{}}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, nil))
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("POST %s = %d, want 405", path, rec.Code)
		}
	}
	// Facets are part of GET /api/products; the separate endpoint no longer exists.
	if rec := get(t, &fakeCatalog{}, "/api/catalog/facets"); rec.Code != http.StatusNotFound {
		t.Errorf("GET /api/catalog/facets = %d, want 404", rec.Code)
	}
}
