package homepage

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
)

// fakeContent stands in for the Store. It holds only ENABLED rows, like the real Store returns:
// a disabled block is simply not in `blocks`.
type fakeContent struct {
	blocks []Block
	slides []Slide
	tiles  []Tile
	err    error
}

func (f *fakeContent) Blocks(context.Context) ([]Block, error) { return f.blocks, f.err }

func (f *fakeContent) BlockByKey(_ context.Context, key string) (Block, error) {
	if f.err != nil {
		return Block{}, f.err
	}
	for _, b := range f.blocks {
		if b.Key == key {
			return b, nil
		}
	}
	return Block{}, ErrNotFound
}

func (f *fakeContent) BlockByType(_ context.Context, blockType string) (Block, error) {
	if f.err != nil {
		return Block{}, f.err
	}
	for _, b := range f.blocks {
		if b.Type == blockType {
			return b, nil
		}
	}
	return Block{}, ErrNotFound
}

func (f *fakeContent) Slides(context.Context) ([]Slide, error) { return f.slides, f.err }
func (f *fakeContent) Tiles(context.Context) ([]Tile, error)   { return f.tiles, f.err }

// fakeCatalog returns canned products and remembers the filters it was asked for.
type fakeCatalog struct {
	products map[string]catalog.ProductDetail
	page     catalog.Page
	filters  []catalog.Filter
	err      error
}

func (f *fakeCatalog) ListProducts(_ context.Context, flt catalog.Filter) (catalog.Page, error) {
	f.filters = append(f.filters, flt)
	return f.page, f.err
}

func (f *fakeCatalog) GetProduct(_ context.Context, slug string) (catalog.ProductDetail, error) {
	if f.err != nil {
		return catalog.ProductDetail{}, f.err
	}
	d, ok := f.products[slug]
	if !ok {
		return catalog.ProductDetail{}, catalog.ErrNotFound
	}
	return d, nil
}

func ptr[T any](v T) *T { return &v }

func defaultBlocks() []Block {
	return []Block{
		{Key: "hero", Type: TypeHero, Title: "Featured", Config: []byte(`{}`)},
		{Key: "tiles", Type: TypeTiles, Title: "Shortcuts", Config: []byte(`{}`)},
		{Key: "platforms", Type: TypePlatforms, Title: "Browse by platform",
			Config: []byte(`{"allLabel": "All games", "allIcon": "layout-grid", "defaultIcon": "gamepad-2", "icons": {"steam": "monitor"}}`)},
		{Key: "discounts", Type: TypeProductRow, Title: "Biggest discounts",
			Config: []byte(`{"sort": "discount", "limit": 5, "viewAllHref": "/store?sort=discount"}`)},
	}
}

func inStock(price int64) catalog.ProductDetail {
	return catalog.ProductDetail{Product: catalog.ProductInfo{PriceCents: &price, InStock: true}}
}

func TestRegistry_keepsOrderAndBuildsEndpoints(t *testing.T) {
	svc := NewService(&fakeContent{blocks: defaultBlocks()}, &fakeCatalog{})
	got, err := svc.Registry(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	want := []RegistryEntry{
		{Key: "hero", Type: "hero", Title: "Featured", Endpoint: "/api/blocks/hero"},
		{Key: "tiles", Type: "tiles", Title: "Shortcuts", Endpoint: "/api/blocks/tiles"},
		{Key: "platforms", Type: "platforms", Title: "Browse by platform", Endpoint: "/api/blocks/platforms"},
		{Key: "discounts", Type: "product_row", Title: "Biggest discounts", Endpoint: "/api/blocks/products/discounts"},
	}
	if !reflect.DeepEqual(got.Blocks, want) {
		t.Errorf("registry:\n got %+v\nwant %+v", got.Blocks, want)
	}
}

func TestRegistry_skipsUnknownTypeAndIsNeverNull(t *testing.T) {
	svc := NewService(&fakeContent{blocks: []Block{{Key: "x", Type: "video_wall", Title: "X"}}}, &fakeCatalog{})
	got, err := svc.Registry(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got.Blocks == nil || len(got.Blocks) != 0 {
		t.Errorf("got %#v, want an empty (not nil) list", got.Blocks)
	}
}

// countingCatalog counts the product look-ups (the preload hint must not price every slide).
type countingCatalog struct {
	fakeCatalog
	lookups int
}

func (c *countingCatalog) GetProduct(ctx context.Context, slug string) (catalog.ProductDetail, error) {
	c.lookups++
	return c.fakeCatalog.GetProduct(ctx, slug)
}

func image(name string) SlideImage {
	return SlideImage{URL: "/banners/" + name + ".webp", Srcset: ptr("/banners/" + name + "-1280.webp 1280w"), MobileURL: "/banners/" + name + "-m.webp"}
}

func slideWith(id int64, name string, productSlug *string) Slide {
	img := image(name)
	return Slide{ID: id, Title: name, ImageURL: img.URL, ImageSrcset: img.Srcset, ImageURLMobile: img.MobileURL, ProductSlug: productSlug, CTALabel: ptr("Buy now")}
}

// Task 17: the preload hint is the picture of the first slide the hero will SHOW (the same rules as
// GET /api/blocks/hero): an out-of-stock product slide before it is skipped, and the slides after the first
// shown one are not looked up at all.
func TestRegistry_preloadIsTheFirstShownSlidesImage(t *testing.T) {
	content := &fakeContent{blocks: defaultBlocks(), slides: []Slide{
		slideWith(1, "sold-out", ptr("sold-out")),
		slideWith(2, "ok", ptr("ok")),
		slideWith(3, "later", ptr("later")),
	}}
	cat := &countingCatalog{fakeCatalog: fakeCatalog{products: map[string]catalog.ProductDetail{
		"sold-out": {Product: catalog.ProductInfo{InStock: false}},
		"ok":       inStock(500),
		"later":    inStock(700),
	}}}
	got, err := NewService(content, cat).Registry(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	want := image("ok")
	if got.Preload.HeroImage == nil || !reflect.DeepEqual(*got.Preload.HeroImage, want) {
		t.Errorf("preload = %+v, want %+v", got.Preload.HeroImage, want)
	}
	if cat.lookups != 2 {
		t.Errorf("product look-ups = %d, want 2 (sold-out, ok; not the third slide)", cat.lookups)
	}
	// The hero block itself shows that same picture first.
	hero, err := NewService(content, &cat.fakeCatalog).Hero(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(hero.Slides[0].Image, want) {
		t.Errorf("hero's first slide image = %+v, want the preloaded %+v", hero.Slides[0].Image, want)
	}
}

func TestRegistry_noPreloadWithoutAHeroBlockOrSlides(t *testing.T) {
	noHero := &fakeContent{blocks: defaultBlocks()[1:], slides: []Slide{slideWith(1, "x", nil)}}
	got, err := NewService(noHero, &fakeCatalog{}).Registry(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got.Preload.HeroImage != nil {
		t.Errorf("hero block off: preload = %+v, want nil", got.Preload.HeroImage)
	}
	noSlides := &fakeContent{blocks: defaultBlocks()}
	got, err = NewService(noSlides, &fakeCatalog{}).Registry(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got.Preload.HeroImage != nil {
		t.Errorf("no slides: preload = %+v, want nil", got.Preload.HeroImage)
	}
}

// The hint is optional: when the slide's product cannot be looked up, the registry still answers (the hero
// block will report its own error), only without the hint.
func TestRegistry_preloadFailureDoesNotFailTheRegistry(t *testing.T) {
	content := &fakeContent{blocks: defaultBlocks(), slides: []Slide{slideWith(1, "x", ptr("x"))}}
	got, err := NewService(content, &fakeCatalog{err: errors.New("connection refused")}).Registry(context.Background())
	if err != nil {
		t.Fatalf("got %v, want the registry without the hint", err)
	}
	if len(got.Blocks) != len(defaultBlocks()) || got.Preload.HeroImage != nil {
		t.Errorf("got %+v, want all blocks and no hint", got)
	}
}

func TestHero_productSlidesGetLivePriceAndProductLink(t *testing.T) {
	content := &fakeContent{blocks: defaultBlocks(), slides: []Slide{
		{ID: 1, Title: "INNERT", Badge: ptr("Coming soon"), ImageURL: "/banners/a.webp", ImageURLMobile: "/banners/m.webp"},
		{ID: 2, Title: "GTA V", ImageURL: "https://img/1", ImageURLMobile: "https://img/2",
			ProductSlug: ptr("gta-v"), CTALabel: ptr("Buy now")},
		{ID: 3, Title: "Sale", ImageURL: "/banners/s.webp", ImageURLMobile: "/banners/s.webp",
			CTALabel: ptr("Shop the sale"), CTAHref: ptr("/store?sort=discount")},
	}}
	cat := &fakeCatalog{products: map[string]catalog.ProductDetail{"gta-v": inStock(1199)}}

	hero, err := NewService(content, cat).Hero(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(hero.Slides) != 3 {
		t.Fatalf("got %d slides, want 3", len(hero.Slides))
	}
	innert, gta, sale := hero.Slides[0], hero.Slides[1], hero.Slides[2]
	if innert.CTA != nil || innert.PriceCents != nil {
		t.Errorf("a slide without a target must have no button and no price, got %+v", innert)
	}
	if gta.PriceCents == nil || *gta.PriceCents != 1199 {
		t.Errorf("product slide price = %v, want the live catalog price 1199", gta.PriceCents)
	}
	if gta.CTA == nil || *gta.CTA != (Link{Label: "Buy now", Href: "/product/gta-v"}) {
		t.Errorf("product slide button = %+v, want Buy now -> /product/gta-v", gta.CTA)
	}
	if sale.CTA == nil || *sale.CTA != (Link{Label: "Shop the sale", Href: "/store?sort=discount"}) || sale.PriceCents != nil {
		t.Errorf("link slide = %+v", sale)
	}
}

// A slide for something that cannot be bought would be a dead end: it is left out.
func TestHero_dropsSlidesOfUnknownOrOutOfStockProducts(t *testing.T) {
	content := &fakeContent{blocks: defaultBlocks(), slides: []Slide{
		{ID: 1, Title: "Gone", ProductSlug: ptr("deleted-product"), CTALabel: ptr("Buy now")},
		{ID: 2, Title: "Sold out", ProductSlug: ptr("sold-out"), CTALabel: ptr("Buy now")},
		{ID: 3, Title: "OK", ProductSlug: ptr("ok"), CTALabel: ptr("Buy now")},
	}}
	cat := &fakeCatalog{products: map[string]catalog.ProductDetail{
		"sold-out": {Product: catalog.ProductInfo{InStock: false}},
		"ok":       inStock(500),
	}}
	hero, err := NewService(content, cat).Hero(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(hero.Slides) != 1 || hero.Slides[0].Title != "OK" {
		t.Errorf("got %+v, want only the in-stock slide", hero.Slides)
	}
}

func TestHero_disabledBlockIsNotFound(t *testing.T) {
	blocks := defaultBlocks()[1:] // no hero row = the hero block is disabled
	_, err := NewService(&fakeContent{blocks: blocks}, &fakeCatalog{}).Hero(context.Background())
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("got %v, want ErrNotFound", err)
	}
}

func TestHero_catalogFailureIsAnError(t *testing.T) {
	content := &fakeContent{blocks: defaultBlocks(), slides: []Slide{{ID: 1, ProductSlug: ptr("x"), CTALabel: ptr("Buy")}}}
	boom := errors.New("connection refused")
	_, err := NewService(content, &fakeCatalog{err: boom}).Hero(context.Background())
	if !errors.Is(err, boom) {
		t.Errorf("got %v, want the catalog error (the handler turns it into 503/500)", err)
	}
}

func TestTiles_collageHasDistinctCoversAndUsesTheTileFilter(t *testing.T) {
	cover := func(u string) *string { return &u }
	content := &fakeContent{blocks: defaultBlocks(), tiles: []Tile{
		{ID: 1, Title: "Steam games", Href: "/store?platform=steam", Accent: "violet", Covers: []byte(`{"sort": "popularity", "platform": "steam"}`)},
		{ID: 2, Title: "Text only", Href: "/store", Accent: "mint"},
	}}
	cat := &fakeCatalog{page: catalog.Page{Items: []catalog.Item{
		{CoverURL: cover("a")}, {CoverURL: cover("a")}, {CoverURL: nil}, {CoverURL: cover("b")}, {CoverURL: cover("c")}, {CoverURL: cover("d")},
	}}}
	got, err := NewService(content, cat).Tiles(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"a", "b", "c"}; !reflect.DeepEqual(got.Tiles[0].CoverURLs, want) {
		t.Errorf("covers = %v, want %v (no repeats, no missing covers, at most 3)", got.Tiles[0].CoverURLs, want)
	}
	if got.Tiles[1].CoverURLs == nil || len(got.Tiles[1].CoverURLs) != 0 {
		t.Errorf("a tile without covers must have an empty list, got %#v", got.Tiles[1].CoverURLs)
	}
	if len(cat.filters) != 1 {
		t.Fatalf("catalog asked %d times, want once (only the tile with covers)", len(cat.filters))
	}
	if f := cat.filters[0]; f.Sort != catalog.SortPopularity || !reflect.DeepEqual(f.Platforms, []string{"steam"}) {
		t.Errorf("filter = %+v, want popularity + steam", f)
	}
}

func TestTiles_badCoversConfigIsAnError(t *testing.T) {
	content := &fakeContent{blocks: defaultBlocks(), tiles: []Tile{{ID: 7, Title: "X", Href: "/", Covers: []byte(`{"sort": "nope"}`)}}}
	if _, err := NewService(content, &fakeCatalog{}).Tiles(context.Background()); err == nil {
		t.Error("expected an error for a bad covers config")
	}
}

// "Up to −{maxDiscount}%" shows the biggest discount the Store's discount listing has right now.
func TestTiles_maxDiscountTokenBecomesTheLiveBiggestDiscount(t *testing.T) {
	content := &fakeContent{blocks: defaultBlocks(), tiles: []Tile{
		{ID: 1, Title: "Up to −{maxDiscount}%", Href: "/store?sort=discount", Accent: "promo"},
		{ID: 2, Title: "Save {maxDiscount}% now", Href: "/store", Accent: "mint"},
		{ID: 3, Title: "Steam games", Href: "/store?platform=steam", Accent: "violet"},
	}}
	cat := &fakeCatalog{page: catalog.Page{Items: []catalog.Item{{InStock: true, DiscountPercent: ptr(int64(73))}}}}

	got, err := NewService(content, cat).Tiles(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	titles := []string{}
	for _, tile := range got.Tiles {
		titles = append(titles, tile.Title)
	}
	if want := []string{"Up to −73%", "Save 73% now", "Steam games"}; !reflect.DeepEqual(titles, want) {
		t.Errorf("titles = %q, want %q", titles, want)
	}
	// One question to the catalog for both tiles: the first card of the discount listing.
	want := []catalog.Filter{{Sort: catalog.SortDiscount, Page: 1, PageSize: 1}}
	if !reflect.DeepEqual(cat.filters, want) {
		t.Errorf("catalog filters = %+v, want %+v", cat.filters, want)
	}
}

// "Up to −0%" would be nonsense: when nothing buyable is discounted the tile is left out.
func TestTiles_maxDiscountTileIsSkippedWithoutADiscount(t *testing.T) {
	cases := map[string][]catalog.Item{
		"empty catalog":          {},
		"no discount known":      {{InStock: true, DiscountPercent: nil}},
		"zero discount":          {{InStock: true, DiscountPercent: ptr(int64(0))}},
		"only out-of-stock left": {{InStock: false, DiscountPercent: ptr(int64(80))}},
	}
	for name, items := range cases {
		t.Run(name, func(t *testing.T) {
			content := &fakeContent{blocks: defaultBlocks(), tiles: []Tile{
				{ID: 1, Title: "Up to −{maxDiscount}%", Href: "/store?sort=discount", Accent: "promo"},
				{ID: 2, Title: "Steam games", Href: "/store?platform=steam", Accent: "violet"},
			}}
			got, err := NewService(content, &fakeCatalog{page: catalog.Page{Items: items}}).Tiles(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if len(got.Tiles) != 1 || got.Tiles[0].Title != "Steam games" {
				t.Errorf("tiles = %+v, want only Steam games", got.Tiles)
			}
		})
	}
}

func TestTiles_maxDiscountCatalogFailureIsAnError(t *testing.T) {
	content := &fakeContent{blocks: defaultBlocks(), tiles: []Tile{{ID: 1, Title: "Up to −{maxDiscount}%", Href: "/", Accent: "promo"}}}
	boom := errors.New("connection refused")
	if _, err := NewService(content, &fakeCatalog{err: boom}).Tiles(context.Background()); !errors.Is(err, boom) {
		t.Errorf("got %v, want the catalog error", err)
	}
}

func TestPlatforms_allGamesFirstThenCatalogFacet(t *testing.T) {
	cat := &fakeCatalog{page: catalog.Page{Total: 108, Facets: catalog.Facets{Platforms: []catalog.FacetOption{
		{Slug: "steam", Name: "Steam", Count: 54},
		{Slug: "psn", Name: "PSN", Count: 17},
	}}}}
	got, err := NewService(&fakeContent{blocks: defaultBlocks()}, cat).Platforms(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	want := []PlatformLink{
		{Key: "all", Label: "All games", Count: 108, Href: "/store", Icon: "layout-grid"},
		{Key: "steam", Label: "Steam", Count: 54, Href: "/store?platform=steam", Icon: "monitor"},
		{Key: "psn", Label: "PSN", Count: 17, Href: "/store?platform=psn", Icon: "gamepad-2"}, // not mapped -> default icon
	}
	if !reflect.DeepEqual(got.Items, want) {
		t.Errorf("items:\n got %+v\nwant %+v", got.Items, want)
	}
}

func TestProductRow_usesTheBlockConfig(t *testing.T) {
	items := []catalog.Item{{Slug: "a", GameID: 1, InStock: true}, {Slug: "b", GameID: 2, InStock: true}}
	cat := &fakeCatalog{page: catalog.Page{Items: items}}
	got, err := NewService(&fakeContent{blocks: defaultBlocks()}, cat).ProductRow(context.Background(), "discounts")
	if err != nil {
		t.Fatal(err)
	}
	// A bigger page is asked for (to have spare versions to drop); the row is cut to `limit` afterwards.
	if f := cat.filters[0]; f.Sort != catalog.SortDiscount || f.PageSize != catalog.MaxPageSize || f.Page != 1 || f.Query != "" || len(f.Platforms) != 0 {
		t.Errorf("filter = %+v, want sort=discount, the biggest page, page 1, no other filter", f)
	}
	if got.ViewAllHref != "/store?sort=discount" || !reflect.DeepEqual(got.Items, items) {
		t.Errorf("got %+v", got)
	}
}

func TestProductRow_onlyEnabledProductRowBlocks(t *testing.T) {
	svc := NewService(&fakeContent{blocks: defaultBlocks()}, &fakeCatalog{})
	for _, key := range []string{"no-such-row", "hero", "platforms"} {
		if _, err := svc.ProductRow(context.Background(), key); !errors.Is(err, ErrNotFound) {
			t.Errorf("ProductRow(%q) error = %v, want ErrNotFound", key, err)
		}
	}
}

func TestProductRow_badConfigIsAnError(t *testing.T) {
	blocks := []Block{{Key: "broken", Type: TypeProductRow, Title: "X", Config: []byte(`{"sort": "discount"}`)}}
	_, err := NewService(&fakeContent{blocks: blocks}, &fakeCatalog{}).ProductRow(context.Background(), "broken")
	if err == nil || errors.Is(err, ErrNotFound) {
		t.Errorf("got %v, want a config error (500), not a 404", err)
	}
}

// slugs lists the slugs of a row, to compare rows in one line.
func slugs(items []catalog.Item) []string {
	out := []string{}
	for _, it := range items {
		out = append(out, it.Slug)
	}
	return out
}

func TestProductRow_oneCardPerGameKeepsTheFirstVersionAndTheOrder(t *testing.T) {
	// GTA V (game 1) has three versions, the Witcher (game 2) two; a version is any later item of a game already shown.
	cat := &fakeCatalog{page: catalog.Page{Items: []catalog.Item{
		{Slug: "gta-v-steam", Title: "GTA V", GameID: 1, InStock: true},
		{Slug: "gta-v-psn", Title: "GTA V", GameID: 1, InStock: true},
		{Slug: "witcher-pc", Title: "The Witcher 3", GameID: 2, InStock: true},
		{Slug: "gta-v-goty", Title: "GTA V", GameID: 1, InStock: true},
		{Slug: "witcher-psn", Title: "The Witcher 3", GameID: 2, InStock: true},
		{Slug: "hades", Title: "Hades", GameID: 3, InStock: true},
	}}}
	got, err := NewService(&fakeContent{blocks: defaultBlocks()}, cat).ProductRow(context.Background(), "discounts")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"gta-v-steam", "witcher-pc", "hades"}; !reflect.DeepEqual(slugs(got.Items), want) {
		t.Errorf("row = %v, want %v (first version of each game, listing order)", slugs(got.Items), want)
	}
}

func TestProductRow_cutsToTheLimitAfterRemovingRepeats(t *testing.T) {
	items := []catalog.Item{}
	for i := int64(1); i <= 8; i++ { // 8 games, each twice: 16 items, limit is 5
		items = append(items, catalog.Item{Slug: fmt.Sprintf("g%d-a", i), GameID: i, InStock: true}, catalog.Item{Slug: fmt.Sprintf("g%d-b", i), GameID: i, InStock: true})
	}
	got, err := NewService(&fakeContent{blocks: defaultBlocks()}, &fakeCatalog{page: catalog.Page{Items: items}}).ProductRow(context.Background(), "discounts")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"g1-a", "g2-a", "g3-a", "g4-a", "g5-a"}; !reflect.DeepEqual(slugs(got.Items), want) {
		t.Errorf("row = %v, want %v", slugs(got.Items), want)
	}
}

func TestProductRow_fewerGamesThanTheLimitIsNotFilledWithRepeats(t *testing.T) {
	items := []catalog.Item{{Slug: "a1", GameID: 1, InStock: true}, {Slug: "a2", GameID: 1, InStock: true}, {Slug: "b1", GameID: 2, InStock: true}, {Slug: "b2", GameID: 2, InStock: true}}
	got, err := NewService(&fakeContent{blocks: defaultBlocks()}, &fakeCatalog{page: catalog.Page{Items: items}}).ProductRow(context.Background(), "discounts")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"a1", "b1"}; !reflect.DeepEqual(slugs(got.Items), want) {
		t.Errorf("row = %v, want %v (2 games, so 2 cards, not 5)", slugs(got.Items), want)
	}
}

func TestProductRow_sameTitleDifferentGameIsNotARepeat(t *testing.T) {
	// De-duplication is by game id, not by title text: two different games may share a title.
	items := []catalog.Item{{Slug: "x1", Title: "Doom", GameID: 1, InStock: true}, {Slug: "x2", Title: "Doom", GameID: 2, InStock: true}}
	got, err := NewService(&fakeContent{blocks: defaultBlocks()}, &fakeCatalog{page: catalog.Page{Items: items}}).ProductRow(context.Background(), "discounts")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"x1", "x2"}; !reflect.DeepEqual(slugs(got.Items), want) {
		t.Errorf("row = %v, want %v", slugs(got.Items), want)
	}
}

func TestProductRow_emptyCatalogGivesAnEmptyRowNotNull(t *testing.T) {
	got, err := NewService(&fakeContent{blocks: defaultBlocks()}, &fakeCatalog{}).ProductRow(context.Background(), "discounts")
	if err != nil {
		t.Fatal(err)
	}
	if got.Items == nil || len(got.Items) != 0 {
		t.Errorf("items = %#v, want an empty, non-nil slice (JSON [] not null)", got.Items)
	}
}

func TestProductRow_outOfStockProductsAreSkippedBeforeTheOnePerGameStep(t *testing.T) {
	// GTA V's top version is out of stock: the game is shown by its FIRST IN-STOCK version.
	// Skyrim has no version in stock: it is not shown at all. The Witcher's first version is in stock and stays.
	cat := &fakeCatalog{page: catalog.Page{Items: []catalog.Item{
		{Slug: "gta-v-steam", GameID: 1, InStock: false},
		{Slug: "skyrim-pc", GameID: 3, InStock: false},
		{Slug: "witcher-pc", GameID: 2, InStock: true},
		{Slug: "gta-v-psn", GameID: 1, InStock: true},
		{Slug: "skyrim-xbox", GameID: 3, InStock: false},
		{Slug: "gta-v-goty", GameID: 1, InStock: true},
		{Slug: "hades", GameID: 4, InStock: true},
	}}}
	got, err := NewService(&fakeContent{blocks: defaultBlocks()}, cat).ProductRow(context.Background(), "discounts")
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"witcher-pc", "gta-v-psn", "hades"}; !reflect.DeepEqual(slugs(got.Items), want) {
		t.Errorf("row = %v, want %v", slugs(got.Items), want)
	}
}

func TestProductRow_allOutOfStockGivesAnEmptyRowNotNull(t *testing.T) {
	cat := &fakeCatalog{page: catalog.Page{Items: []catalog.Item{{Slug: "a", GameID: 1}, {Slug: "b", GameID: 2}}}}
	got, err := NewService(&fakeContent{blocks: defaultBlocks()}, cat).ProductRow(context.Background(), "discounts")
	if err != nil {
		t.Fatal(err)
	}
	if got.Items == nil || len(got.Items) != 0 {
		t.Errorf("items = %#v, want an empty, non-nil slice", got.Items)
	}
}
