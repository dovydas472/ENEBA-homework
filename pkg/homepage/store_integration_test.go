package homepage_test

// Integration tests: the real router + homepage.Service + homepage.Store + catalog.Store against a
// real Postgres with every migration applied (00006 inserts the home page content, 00007 makes the
// discount tile's number live) and the
// deterministic demo catalog (pkg/testdb). Skipped when TEST_DATABASE_URL is empty; CI runs them.
//
// Some tests switch a block off and on again. They restore the row in t.Cleanup, and the tests of
// this package run one after another (none calls t.Parallel), so they never see each other's changes.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
	"github.com/dovydas472/ENEBA-homework/pkg/homepage"
	"github.com/dovydas472/ENEBA-homework/pkg/server"
	"github.com/dovydas472/ENEBA-homework/pkg/testdb"
)

type env struct {
	pool    *pgxpool.Pool
	catalog *catalog.Store
	router  http.Handler
}

func newEnv(t *testing.T) env {
	t.Helper()
	pool := testdb.Pool(t)
	cat := catalog.NewStoreFromPool(pool)
	svc := homepage.NewService(homepage.NewStoreFromPool(pool), cat)
	return env{pool: pool, catalog: cat, router: server.NewRouter(server.Deps{Catalog: cat, Homepage: svc})}
}

// get calls the router and decodes the JSON body into out. It returns the status code.
func (e env) get(t *testing.T, path string, out any) int {
	t.Helper()
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	if rec.Code == http.StatusOK && out != nil {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("GET %s: body is not JSON: %v", path, err)
		}
	}
	return rec.Code
}

// setEnabled switches a block on or off and puts the old value back when the test ends.
func (e env) setEnabled(t *testing.T, key string, enabled bool) {
	t.Helper()
	ctx := context.Background()
	var old bool
	if err := e.pool.QueryRow(ctx, `SELECT enabled FROM homepage_blocks WHERE key = $1`, key).Scan(&old); err != nil {
		t.Fatalf("read block %q: %v", key, err)
	}
	t.Cleanup(func() {
		if _, err := e.pool.Exec(context.Background(), `UPDATE homepage_blocks SET enabled = $2 WHERE key = $1`, key, old); err != nil {
			t.Errorf("restore block %q: %v", key, err)
		}
	})
	if _, err := e.pool.Exec(ctx, `UPDATE homepage_blocks SET enabled = $2 WHERE key = $1`, key, enabled); err != nil {
		t.Fatalf("update block %q: %v", key, err)
	}
}

func registryKeys(t *testing.T, e env) []string {
	t.Helper()
	var reg homepage.Registry
	if code := e.get(t, "/api/homepage", &reg); code != http.StatusOK {
		t.Fatalf("GET /api/homepage = %d", code)
	}
	keys := []string{}
	for _, b := range reg.Blocks {
		keys = append(keys, b.Key)
	}
	return keys
}

func TestHomepageIntegration_registryOrderMatchesTable(t *testing.T) {
	e := newEnv(t)
	rows, err := e.pool.Query(context.Background(), `SELECT key FROM homepage_blocks WHERE enabled ORDER BY position, id`)
	if err != nil {
		t.Fatal(err)
	}
	fromTable, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	got := registryKeys(t, e)
	if !reflect.DeepEqual(got, fromTable) {
		t.Errorf("registry = %v, table order = %v", got, fromTable)
	}
	// The content of migration 00006.
	if want := []string{"hero", "tiles", "platforms", "popular", "discounts", "new-releases"}; !reflect.DeepEqual(got, want) {
		t.Errorf("registry = %v, want %v", got, want)
	}

	// Moving a block in the table moves it on the page (no deploy): put "new-releases" first.
	if _, err := e.pool.Exec(context.Background(), `UPDATE homepage_blocks SET position = 1 WHERE key = 'new-releases'`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = e.pool.Exec(context.Background(), `UPDATE homepage_blocks SET position = 60 WHERE key = 'new-releases'`)
	})
	if got := registryKeys(t, e); got[0] != "new-releases" {
		t.Errorf("after the reorder the registry starts with %q, want new-releases", got[0])
	}
}

func TestHomepageIntegration_togglingEnabledHidesABlock(t *testing.T) {
	e := newEnv(t)

	e.setEnabled(t, "discounts", false)
	for _, k := range registryKeys(t, e) {
		if k == "discounts" {
			t.Fatal("a disabled block is still in the registry")
		}
	}
	if code := e.get(t, "/api/blocks/products/discounts", nil); code != http.StatusNotFound {
		t.Errorf("disabled product row endpoint = %d, want 404", code)
	}

	e.setEnabled(t, "hero", false)
	if code := e.get(t, "/api/blocks/hero", nil); code != http.StatusNotFound {
		t.Errorf("disabled hero endpoint = %d, want 404", code)
	}

	// And back on: it reappears in its old place.
	e.setEnabled(t, "discounts", true)
	e.setEnabled(t, "hero", true)
	if want, got := []string{"hero", "tiles", "platforms", "popular", "discounts", "new-releases"}, registryKeys(t, e); !reflect.DeepEqual(got, want) {
		t.Errorf("after enabling again: %v, want %v", got, want)
	}
}

func TestHomepageIntegration_productRowsReturnFiveSortedAsConfigured(t *testing.T) {
	e := newEnv(t)
	cases := map[string]struct {
		sort    catalog.Sort
		viewAll string
	}{
		"popular":      {catalog.SortPopularity, "/store"},
		"discounts":    {catalog.SortDiscount, "/store?sort=discount"},
		"new-releases": {catalog.SortNewest, "/store?sort=newest"},
	}
	for key, c := range cases {
		t.Run(key, func(t *testing.T) {
			var row homepage.ProductRow
			if code := e.get(t, "/api/blocks/products/"+key, &row); code != http.StatusOK {
				t.Fatalf("status %d", code)
			}
			if len(row.Items) != 5 {
				t.Fatalf("got %d items, want 5", len(row.Items))
			}
			// The row is the Store listing with the same sort, one card per game: the first version of each
			// game, in listing order. Rebuilt here from the whole listing, with the game id the JSON does not carry.
			page, err := e.catalog.ListProducts(context.Background(), catalog.Filter{Sort: c.sort, Page: 1, PageSize: catalog.MaxPageSize})
			if err != nil {
				t.Fatal(err)
			}
			seen := map[int64]bool{}
			want := []string{}
			for _, it := range page.Items {
				if !seen[it.GameID] && len(want) < 5 {
					seen[it.GameID] = true
					want = append(want, it.Slug)
				}
			}
			got := []string{}
			titles := map[string]bool{}
			for _, it := range row.Items {
				got = append(got, it.Slug)
				if titles[it.Title] {
					t.Errorf("title %q appears twice in the %s row", it.Title, key)
				}
				titles[it.Title] = true
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("row = %v, want %v", got, want)
			}
			if row.ViewAllHref != c.viewAll {
				t.Errorf("viewAllHref = %q, want %q", row.ViewAllHref, c.viewAll)
			}
		})
	}

	// "Biggest discounts" really is sorted by discount, biggest first.
	var row homepage.ProductRow
	e.get(t, "/api/blocks/products/discounts", &row)
	for i := 1; i < len(row.Items); i++ {
		prev, cur := row.Items[i-1].DiscountPercent, row.Items[i].DiscountPercent
		if prev == nil || cur == nil || *cur > *prev {
			t.Errorf("discounts not descending at %d: %v then %v", i, prev, cur)
		}
	}
}

func TestHomepageIntegration_heroHasLiveCatalogPrices(t *testing.T) {
	e := newEnv(t)
	var hero homepage.Hero
	if code := e.get(t, "/api/blocks/hero", &hero); code != http.StatusOK {
		t.Fatalf("status %d", code)
	}
	titles := []string{}
	for _, s := range hero.Slides {
		titles = append(titles, s.Title)
	}
	if want := []string{"INNERT", "Grand Theft Auto V", "The Witcher 3: Wild Hunt"}; !reflect.DeepEqual(titles, want) {
		t.Fatalf("slides = %v, want %v", titles, want)
	}
	if innert := hero.Slides[0]; innert.CTA != nil || innert.PriceCents != nil {
		t.Errorf("Innert must have no button and no price, got %+v", innert)
	}
	for _, s := range hero.Slides[1:] {
		if s.CTA == nil || s.PriceCents == nil {
			t.Fatalf("product slide %q has no button or price", s.Title)
		}
		slug := s.CTA.Href[len("/product/"):]
		d, err := e.catalog.GetProduct(context.Background(), slug)
		if err != nil {
			t.Fatal(err)
		}
		if *s.PriceCents != *d.Product.PriceCents {
			t.Errorf("%s: slide price %d, product page price %d", slug, *s.PriceCents, *d.Product.PriceCents)
		}
	}

	// The price is LIVE (not copied into the slide row): make GTA V's cheapest offer one cent
	// cheaper and the slide follows. The old price is put back when the test ends.
	ctx := context.Background()
	const gta = "grand-theft-auto-v-steam-global"
	d, err := e.catalog.GetProduct(ctx, gta)
	if err != nil {
		t.Fatal(err)
	}
	cheapest := d.Offers[0]
	t.Cleanup(func() {
		if _, err := e.pool.Exec(context.Background(), `UPDATE offers SET price_cents = $2 WHERE id = $1`, cheapest.OfferID, cheapest.PriceCents); err != nil {
			t.Errorf("restore the offer price: %v", err)
		}
	})
	if _, err := e.pool.Exec(ctx, `UPDATE offers SET price_cents = $2 WHERE id = $1`, cheapest.OfferID, cheapest.PriceCents-1); err != nil {
		t.Fatal(err)
	}
	var after homepage.Hero
	e.get(t, "/api/blocks/hero", &after)
	if got := after.Slides[1].PriceCents; got == nil || *got != cheapest.PriceCents-1 {
		t.Errorf("after the price change the slide shows %v, want %d", got, cheapest.PriceCents-1)
	}
}

func TestHomepageIntegration_platformsAndTiles(t *testing.T) {
	e := newEnv(t)

	var p homepage.Platforms
	if code := e.get(t, "/api/blocks/platforms", &p); code != http.StatusOK {
		t.Fatalf("platforms status %d", code)
	}
	page, err := e.catalog.ListProducts(context.Background(), catalog.Filter{Sort: catalog.SortPopularity, Page: 1, PageSize: 1})
	if err != nil {
		t.Fatal(err)
	}
	if all := p.Items[0]; all.Key != "all" || all.Count != page.Total || all.Href != "/store" {
		t.Errorf("first entry = %+v, want All games with %d products", all, page.Total)
	}
	if len(p.Items) != 1+len(page.Facets.Platforms) {
		t.Fatalf("got %d entries, want 1 + %d platforms", len(p.Items), len(page.Facets.Platforms))
	}
	for i, f := range page.Facets.Platforms {
		if got := p.Items[i+1]; got.Key != f.Slug || got.Count != f.Count || got.Href != "/store?platform="+f.Slug || got.Icon == "" {
			t.Errorf("entry %d = %+v, Store facet = %+v", i+1, got, f)
		}
	}

	var tiles homepage.Tiles
	if code := e.get(t, "/api/blocks/tiles", &tiles); code != http.StatusOK {
		t.Fatalf("tiles status %d", code)
	}
	wantHrefs := []string{"/store?sort=discount", "/store?platform=steam", "/store?sort=newest"}
	if len(tiles.Tiles) != len(wantHrefs) {
		t.Fatalf("got %d tiles, want 3", len(tiles.Tiles))
	}
	for i, tile := range tiles.Tiles {
		if tile.Href != wantHrefs[i] {
			t.Errorf("tile %d href = %q, want %q", i, tile.Href, wantHrefs[i])
		}
		if len(tile.CoverURLs) != 3 {
			t.Errorf("tile %q has %d covers, want 3", tile.Title, len(tile.CoverURLs))
		}
	}
}

// Migration 00007: the discount tile says "Up to −N%" where N is the biggest discount of the Store's
// discount listing right now - and it follows the catalog without anyone editing the tile.
func TestHomepageIntegration_discountTileShowsTheLiveMaxDiscount(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()

	discountTile := func() string {
		t.Helper()
		var tiles homepage.Tiles
		if code := e.get(t, "/api/blocks/tiles", &tiles); code != http.StatusOK {
			t.Fatalf("tiles status %d", code)
		}
		for _, tile := range tiles.Tiles {
			if tile.Href == "/store?sort=discount" {
				return tile.Title
			}
		}
		t.Fatal("no discount tile")
		return ""
	}
	topOfDiscountListing := func() catalog.Item {
		t.Helper()
		page, err := e.catalog.ListProducts(ctx, catalog.Filter{Sort: catalog.SortDiscount, Page: 1, PageSize: 1})
		if err != nil {
			t.Fatal(err)
		}
		return page.Items[0]
	}

	top := topOfDiscountListing()
	if top.DiscountPercent == nil || *top.DiscountPercent <= 0 {
		t.Fatalf("the demo catalog must have a discounted product first, got %+v", top)
	}
	if got, want := discountTile(), fmt.Sprintf("Up to −%d%%", *top.DiscountPercent); got != want {
		t.Errorf("discount tile = %q, want %q", got, want)
	}

	// Make the top product's cheapest offer cheaper: its discount grows and the tile follows.
	// The old price is put back when the test ends.
	d, err := e.catalog.GetProduct(ctx, top.Slug)
	if err != nil {
		t.Fatal(err)
	}
	cheapest := d.Offers[0]
	t.Cleanup(func() {
		if _, err := e.pool.Exec(context.Background(), `UPDATE offers SET price_cents = $2 WHERE id = $1`, cheapest.OfferID, cheapest.PriceCents); err != nil {
			t.Errorf("restore the offer price: %v", err)
		}
	})
	if _, err := e.pool.Exec(ctx, `UPDATE offers SET price_cents = $2 WHERE id = $1`, cheapest.OfferID, cheapest.PriceCents/2); err != nil {
		t.Fatal(err)
	}
	after := topOfDiscountListing()
	if after.DiscountPercent == nil || *after.DiscountPercent <= *top.DiscountPercent {
		t.Fatalf("halving the price did not raise the biggest discount: %v -> %v", top.DiscountPercent, after.DiscountPercent)
	}
	if got, want := discountTile(), fmt.Sprintf("Up to −%d%%", *after.DiscountPercent); got != want {
		t.Errorf("after the price change the tile = %q, want %q", got, want)
	}
}

// The CHECK constraints and the unique index of 00006 refuse bad content, whatever the code does.
func TestHomepageIntegration_databaseRefusesBadContent(t *testing.T) {
	e := newEnv(t)
	cases := map[string]string{
		"a second hero block":        `INSERT INTO homepage_blocks (key, type, title, position) VALUES ('hero-2', 'hero', 'Another hero', 99)`,
		"an unknown block type":      `INSERT INTO homepage_blocks (key, type, title, position) VALUES ('wall', 'video_wall', 'Videos', 99)`,
		"a bad block key":            `INSERT INTO homepage_blocks (key, type, title, position) VALUES ('Top Deals', 'product_row', 'X', 99)`,
		"a config that is no object": `INSERT INTO homepage_blocks (key, type, title, position, config) VALUES ('x', 'product_row', 'X', 99, '[1]')`,
		"an external slide link": `INSERT INTO homepage_slides (position, title, image_url, image_url_mobile, cta_label, cta_href)
			VALUES (99, 'X', '/a.webp', '/a.webp', 'Go', '//evil.example')`,
		"a button without a target": `INSERT INTO homepage_slides (position, title, image_url, image_url_mobile, cta_label)
			VALUES (99, 'X', '/a.webp', '/a.webp', 'Go')`,
		"a target without a label": `INSERT INTO homepage_slides (position, title, image_url, image_url_mobile, product_slug)
			VALUES (99, 'X', '/a.webp', '/a.webp', 'some-product')`,
		"a product AND a link": `INSERT INTO homepage_slides (position, title, image_url, image_url_mobile, product_slug, cta_label, cta_href)
			VALUES (99, 'X', '/a.webp', '/a.webp', 'p', 'Go', '/store')`,
		"an http image": `INSERT INTO homepage_slides (position, title, image_url, image_url_mobile)
			VALUES (99, 'X', 'http://img.example/a.jpg', '/a.webp')`,
		"an external tile link":  `INSERT INTO homepage_tiles (position, title, href) VALUES (99, 'X', 'https://example.com')`,
		"an unknown tile accent": `INSERT INTO homepage_tiles (position, title, href, accent) VALUES (99, 'X', '/store', 'red')`,
	}
	for name, sql := range cases {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			tx, err := e.pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = tx.Rollback(ctx) }() // never keep anything
			if _, err := tx.Exec(ctx, sql); err == nil {
				t.Errorf("the database accepted %s", name)
			}
		})
	}
}
