package catalog_test

// Integration tests: the real Store against a real Postgres that holds the
// deterministic demo catalog (see pkg/testdb). They are skipped when
// TEST_DATABASE_URL is empty. The expected numbers are stable because the seed
// is deterministic (Task 08 report: 108 products, 11 of them out of stock).

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
	"github.com/dovydas472/ENEBA-homework/pkg/testdb"
)

const (
	totalProducts      = 108
	outOfStockProducts = 11
	witcher            = "the-witcher-3-wild-hunt-steam-global"
)

func newStore(t *testing.T) *catalog.Store {
	t.Helper()
	return catalog.NewStoreFromPool(testdb.Pool(t))
}

// list runs ListProducts with defaults for everything the test does not set.
func list(t *testing.T, s *catalog.Store, f catalog.Filter) catalog.Page {
	t.Helper()
	if f.Sort == "" {
		f.Sort = catalog.SortPopularity
	}
	if f.Page == 0 {
		f.Page = 1
	}
	if f.PageSize == 0 {
		f.PageSize = catalog.DefaultPageSize
	}
	page, err := s.ListProducts(context.Background(), f)
	if err != nil {
		t.Fatalf("ListProducts(%+v): %v", f, err)
	}
	return page
}

// allItems walks every page (48 per page) and returns the whole ordered result.
func allItems(t *testing.T, s *catalog.Store, f catalog.Filter) []catalog.Item {
	t.Helper()
	f.PageSize = catalog.MaxPageSize
	var out []catalog.Item
	for p := 1; ; p++ {
		f.Page = p
		page := list(t, s, f)
		out = append(out, page.Items...)
		if int64(len(out)) >= page.Total || len(page.Items) == 0 {
			return out
		}
	}
}

func counts(opts []catalog.FacetOption) map[string]int64 {
	m := map[string]int64{}
	for _, o := range opts {
		m[o.Slug] = o.Count
	}
	return m
}

func sum(opts []catalog.FacetOption) int64 {
	var n int64
	for _, o := range opts {
		n += o.Count
	}
	return n
}

func TestListProducts_defaultSort(t *testing.T) {
	s := newStore(t)
	page := list(t, s, catalog.Filter{})

	if page.Total != totalProducts {
		t.Errorf("total = %d, want %d", page.Total, totalProducts)
	}
	if page.Page != 1 || page.PageSize != catalog.DefaultPageSize || len(page.Items) != catalog.DefaultPageSize {
		t.Errorf("page=%d pageSize=%d items=%d", page.Page, page.PageSize, len(page.Items))
	}
	first := page.Items[0]
	if first.Slug != "grand-theft-auto-v-steam-global" {
		t.Fatalf("first item = %q, want grand-theft-auto-v-steam-global", first.Slug)
	}
	// Values from the Task 08 report: 11.99 EUR, MSRP 29.99, -60 %, one offer.
	if first.PriceCents == nil || *first.PriceCents != 1199 ||
		first.MSRPCents == nil || *first.MSRPCents != 2999 ||
		first.DiscountPercent == nil || *first.DiscountPercent != 60 ||
		first.OfferCount != 1 || !first.InStock {
		t.Errorf("first item = %+v", first)
	}
	if first.Platform != (catalog.Ref{Slug: "steam", Name: "Steam"}) || first.Region != (catalog.Ref{Slug: "global", Name: "GLOBAL"}) {
		t.Errorf("platform/region = %+v / %+v", first.Platform, first.Region)
	}
}

func TestListProducts_platformFilter(t *testing.T) {
	s := newStore(t)
	items := allItems(t, s, catalog.Filter{Platforms: []string{"psn"}})
	if len(items) != 17 { // Task 08 report: 17 PSN products
		t.Errorf("psn products = %d, want 17", len(items))
	}
	for _, it := range items {
		if it.Platform.Slug != "psn" {
			t.Errorf("%s has platform %q", it.Slug, it.Platform.Slug)
		}
	}

	// Several platforms are OR-ed; an unknown slug just matches nothing.
	both := list(t, s, catalog.Filter{Platforms: []string{"psn", "gog-com", "no-such-platform"}})
	if both.Total != 17+4 {
		t.Errorf("psn+gog-com total = %d, want 21", both.Total)
	}
}

func TestListProducts_priceSorts(t *testing.T) {
	s := newStore(t)

	asc := allItems(t, s, catalog.Filter{Sort: catalog.SortPriceAsc})
	desc := allItems(t, s, catalog.Filter{Sort: catalog.SortPriceDesc})
	for name, items := range map[string][]catalog.Item{"price_asc": asc, "price_desc": desc} {
		if len(items) != totalProducts {
			t.Fatalf("%s: %d items, want %d", name, len(items), totalProducts)
		}
		inStock := len(items) - outOfStockProducts
		for i, it := range items {
			if (i < inStock) != it.InStock {
				t.Fatalf("%s: item %d (%s) inStock=%v - in-stock items must come first, out-of-stock last", name, i, it.Slug, it.InStock)
			}
			if it.InStock != (it.PriceCents != nil) {
				t.Fatalf("%s: %s inStock=%v but priceCents=%v", name, it.Slug, it.InStock, it.PriceCents)
			}
			if i > 0 && i < inStock {
				prev, cur := *items[i-1].PriceCents, *it.PriceCents
				if (name == "price_asc" && prev > cur) || (name == "price_desc" && prev < cur) {
					t.Fatalf("%s: price order broken at %d: %d then %d", name, i, prev, cur)
				}
			}
		}
	}

	// The cheapest in-stock product on dev/CI is Portal 2 on Steam (8.49) or cheaper;
	// the exact value is not pinned, but it must be a real positive price.
	if *asc[0].PriceCents <= 0 {
		t.Errorf("cheapest price = %d", *asc[0].PriceCents)
	}
}

func TestListProducts_discountSortPutsOutOfStockLast(t *testing.T) {
	items := allItems(t, newStore(t), catalog.Filter{Sort: catalog.SortDiscount})
	inStock := len(items) - outOfStockProducts
	for i, it := range items {
		if (i < inStock) != it.InStock {
			t.Fatalf("item %d (%s) inStock=%v: out-of-stock products must be last", i, it.Slug, it.InStock)
		}
		if i > 0 && i < inStock && items[i-1].DiscountPercent != nil {
			// Once a product without discount appears, no product with a discount may follow.
			if it.DiscountPercent != nil && *it.DiscountPercent > *items[i-1].DiscountPercent {
				t.Fatalf("discount order broken at %d", i)
			}
		}
		if it.DiscountPercent == nil && i > 0 && i < inStock {
			for _, later := range items[i:inStock] {
				if later.DiscountPercent != nil {
					t.Fatalf("%s has a discount after %s which has none", later.Slug, it.Slug)
				}
			}
		}
	}
	// The best discount first: Witcher 3 (-72 %) is among the leaders of the seed.
	if items[0].DiscountPercent == nil || *items[0].DiscountPercent < 72 {
		t.Errorf("best discount = %v, want >= 72", items[0].DiscountPercent)
	}
}

func TestListProducts_discountPercentIsDerivedAndRoundedDown(t *testing.T) {
	for _, it := range allItems(t, newStore(t), catalog.Filter{}) {
		switch {
		case it.PriceCents != nil && it.MSRPCents != nil && *it.PriceCents < *it.MSRPCents:
			want := (*it.MSRPCents - *it.PriceCents) * 100 / *it.MSRPCents // integer division rounds down
			if it.DiscountPercent == nil || *it.DiscountPercent != want {
				t.Errorf("%s: discount = %v, want %d", it.Slug, it.DiscountPercent, want)
			}
		default:
			if it.DiscountPercent != nil {
				t.Errorf("%s: discount = %d, want null (no real discount / out of stock)", it.Slug, *it.DiscountPercent)
			}
		}
	}
}

func TestListProducts_newestAndTitleSorts(t *testing.T) {
	s := newStore(t)

	newest := allItems(t, s, catalog.Filter{Sort: catalog.SortNewest})
	if len(newest) != totalProducts {
		t.Fatalf("newest: %d items", len(newest))
	}
	// The listing does not carry the release date, so read it from the product page.
	// The date format "2006-01-02" sorts correctly as text. The first 15 must be newest-first.
	prev := "9999-12-31"
	for _, it := range newest[:15] {
		d, err := s.GetProduct(context.Background(), it.Slug)
		if err != nil {
			t.Fatal(err)
		}
		if d.Game.ReleaseDate == nil {
			t.Fatalf("%s has no release date but is among the newest 15", it.Slug)
		}
		if *d.Game.ReleaseDate > prev {
			t.Fatalf("newest order broken at %s: %s after %s", it.Slug, *d.Game.ReleaseDate, prev)
		}
		prev = *d.Game.ReleaseDate
	}

	title := allItems(t, s, catalog.Filter{Sort: catalog.SortTitle})
	// Exact alphabetical order depends on the database collation, which differs between
	// machines; the first character (digits before letters, a before b ...) does not.
	firstChar := func(it catalog.Item) byte {
		for _, c := range []byte(strings.ToLower(it.Title)) {
			if (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') {
				return c
			}
		}
		return 0
	}
	for i := 1; i < len(title); i++ {
		if firstChar(title[i-1]) > firstChar(title[i]) {
			t.Fatalf("title order broken at %d: %q then %q", i, title[i-1].Title, title[i].Title)
		}
	}
}

func TestListProducts_priceFilterUsesStockAwarePrice(t *testing.T) {
	s := newStore(t)
	items := allItems(t, s, catalog.Filter{MinPrice: ptr(int64(1000)), MaxPrice: ptr(int64(2000))})
	if len(items) == 0 {
		t.Fatal("expected some products between 10.00 and 20.00")
	}
	for _, it := range items {
		if !it.InStock || it.PriceCents == nil {
			t.Fatalf("%s: out-of-stock products must be excluded when a price filter is set", it.Slug)
		}
		if *it.PriceCents < 1000 || *it.PriceCents > 2000 {
			t.Errorf("%s: price %d outside 1000..2000", it.Slug, *it.PriceCents)
		}
	}

	// Only a lower bound also excludes out-of-stock products (their price is NULL).
	for _, it := range allItems(t, s, catalog.Filter{MinPrice: ptr(int64(0))}) {
		if !it.InStock {
			t.Fatalf("%s: out-of-stock product returned for minPrice=0", it.Slug)
		}
	}
	if got := list(t, s, catalog.Filter{MinPrice: ptr(int64(0))}).Total; got != totalProducts-outOfStockProducts {
		t.Errorf("minPrice=0 total = %d, want %d", got, totalProducts-outOfStockProducts)
	}
}

func TestListProducts_paging(t *testing.T) {
	s := newStore(t)
	seen := map[string]bool{}
	for p := 1; p <= 3; p++ {
		page := list(t, s, catalog.Filter{Page: p, PageSize: 48})
		for _, it := range page.Items {
			if seen[it.Slug] {
				t.Fatalf("%s appears on two pages: the order is not stable", it.Slug)
			}
			seen[it.Slug] = true
		}
		if page.Total != totalProducts {
			t.Errorf("page %d total = %d", p, page.Total)
		}
	}
	if len(seen) != totalProducts {
		t.Errorf("pages 1-3 hold %d distinct products, want %d", len(seen), totalProducts)
	}

	// A page after the last one: no items (an empty list, not null), but the real total.
	past := list(t, s, catalog.Filter{Page: 4, PageSize: 48})
	if past.Items == nil || len(past.Items) != 0 {
		t.Errorf("items = %v, want an empty non-nil slice", past.Items)
	}
	if past.Total != totalProducts {
		t.Errorf("total after the last page = %d, want %d", past.Total, totalProducts)
	}
}

// The card's "Add to cart" adds item.CheapestOffer; the product page's buy box adds
// its first offer. They must be the SAME offer for every product (Task 12).
func TestListProducts_cheapestOfferMatchesProductPage(t *testing.T) {
	s := newStore(t)
	items := allItems(t, s, catalog.Filter{Sort: catalog.SortPriceAsc})
	if len(items) != totalProducts {
		t.Fatalf("%d items, want %d", len(items), totalProducts)
	}
	for _, it := range items {
		if it.InStock != (it.CheapestOffer != nil) {
			t.Fatalf("%s: inStock=%v but cheapestOffer=%+v", it.Slug, it.InStock, it.CheapestOffer)
		}
		d, err := s.GetProduct(context.Background(), it.Slug)
		if err != nil {
			t.Fatal(err)
		}
		if it.CheapestOffer == nil {
			if len(d.Offers) != 0 {
				t.Errorf("%s: no cheapest offer in the listing, but the product page has %d offers", it.Slug, len(d.Offers))
			}
			continue
		}
		first := d.Offers[0]
		got := *it.CheapestOffer
		want := catalog.CheapestOffer{OfferID: first.OfferID, Stock: first.Stock, SellerName: first.Seller.Name}
		if got != want {
			t.Errorf("%s: cheapestOffer = %+v, product page first offer = %+v", it.Slug, got, want)
		}
		if it.PriceCents == nil || *it.PriceCents != first.PriceCents {
			t.Errorf("%s: item price %v, first offer price %d", it.Slug, it.PriceCents, first.PriceCents)
		}
	}

	// A known product: Witcher 3's cheapest offer is Retro Ridge at 10.99 with 6 keys (Task 08 report).
	for _, it := range items {
		if it.Slug == witcher {
			if it.CheapestOffer == nil || it.CheapestOffer.Stock != 6 || it.CheapestOffer.SellerName == "" {
				t.Errorf("witcher cheapestOffer = %+v", it.CheapestOffer)
			}
		}
	}
}

func TestListProducts_unknownSortIsRejected(t *testing.T) {
	_, err := newStore(t).ListProducts(context.Background(), catalog.Filter{Sort: "price; DROP TABLE products", Page: 1, PageSize: 10})
	if err == nil {
		t.Fatal("an unknown sort must never reach the SQL")
	}
}

// ---- facets ---------------------------------------------------------------

func TestFacets_withoutFilters(t *testing.T) {
	f := list(t, newStore(t), catalog.Filter{}).Facets

	plat := counts(f.Platforms)
	if _, ok := plat["battle-net"]; ok {
		t.Error("Battle.net has no products and must not be listed")
	}
	for _, o := range f.Platforms {
		if o.Count <= 0 {
			t.Errorf("platform %s listed with count %d", o.Slug, o.Count)
		}
	}
	if got := sum(f.Platforms); got != totalProducts {
		t.Errorf("platform counts add up to %d, want %d", got, totalProducts)
	}
	if got := sum(f.Regions); got != totalProducts {
		t.Errorf("region counts add up to %d, want %d", got, totalProducts)
	}
	if plat["steam"] != 54 || plat["psn"] != 17 { // Task 08 report
		t.Errorf("steam=%d psn=%d, want 54 and 17", plat["steam"], plat["psn"])
	}
	// Ordered by sort_order (Steam 10, Xbox Live 20, PSN 30 ...), not by count or name.
	if f.Platforms[0].Slug != "steam" || f.Platforms[1].Slug != "xbox-live" || f.Platforms[2].Slug != "psn" {
		t.Errorf("platform order: %+v", f.Platforms)
	}
	if f.Regions[0].Slug != "global" {
		t.Errorf("region order: %+v", f.Regions)
	}
	if f.PriceRange == nil || f.PriceRange.MinCents <= 0 || f.PriceRange.MinCents > f.PriceRange.MaxCents {
		t.Errorf("priceRange = %+v", f.PriceRange)
	}
}

// Standard multi-select faceting: each group is counted with every OTHER
// filter applied, but not its own - so its other options keep their counts.
func TestFacets_followTheOtherFilters(t *testing.T) {
	s := newStore(t)
	all := list(t, s, catalog.Filter{}).Facets
	steam := list(t, s, catalog.Filter{Platforms: []string{"steam"}}).Facets

	// Platform group ignores its own filter: identical to the unfiltered counts.
	if got, want := counts(steam.Platforms), counts(all.Platforms); !equalCounts(got, want) {
		t.Errorf("platform counts changed by the platform filter:\n got %v\nwant %v", got, want)
	}
	if counts(steam.Platforms)["psn"] <= 0 {
		t.Error("with platform=steam the psn count must stay > 0")
	}

	// Region group follows the platform filter: only Steam products are counted.
	if got := sum(steam.Regions); got != 54 {
		t.Errorf("region counts with platform=steam add up to %d, want 54", got)
	}
	if equalCounts(counts(steam.Regions), counts(all.Regions)) {
		t.Error("region counts did not change when a platform was selected")
	}

	// Both groups at once: platform counts follow the region, region counts follow the platform.
	both := list(t, s, catalog.Filter{Platforms: []string{"steam"}, Regions: []string{"global"}})
	if got, want := sum(both.Facets.Platforms), list(t, s, catalog.Filter{Regions: []string{"global"}}).Total; got != want {
		t.Errorf("platform counts = %d, want %d (all products of region global)", got, want)
	}
	if got, want := sum(both.Facets.Regions), list(t, s, catalog.Filter{Platforms: []string{"steam"}}).Total; got != want {
		t.Errorf("region counts = %d, want %d (all products of platform steam)", got, want)
	}
	// The result itself uses both filters, the facets of one group do not use its own.
	if both.Total > counts(both.Facets.Platforms)["steam"] {
		t.Errorf("total %d is larger than the steam facet %d", both.Total, counts(both.Facets.Platforms)["steam"])
	}
}

func TestFacets_selectedEntryStaysListedWithZero(t *testing.T) {
	s := newStore(t)

	// Battle.net has no products at all, but it is selected: it stays in the list with 0.
	page := list(t, s, catalog.Filter{Platforms: []string{"battle-net"}})
	if page.Total != 0 || page.Items == nil || len(page.Items) != 0 {
		t.Errorf("total=%d items=%v, want an empty result", page.Total, page.Items)
	}
	plat := counts(page.Facets.Platforms)
	if c, ok := plat["battle-net"]; !ok || c != 0 {
		t.Errorf("battle-net must be listed with count 0, got %v (listed=%v)", c, ok)
	}
	if plat["steam"] != 54 {
		t.Errorf("other platforms keep their counts, steam = %d", plat["steam"])
	}
	// The selected entry keeps its sort_order position (last of the nine).
	if last := page.Facets.Platforms[len(page.Facets.Platforms)-1]; last.Slug != "battle-net" {
		t.Errorf("battle-net should be last, got %+v", page.Facets.Platforms)
	}

	// A price filter that matches nothing: the selected platform stays, everything else drops out.
	none := list(t, s, catalog.Filter{Platforms: []string{"steam"}, MinPrice: ptr(int64(99_999_999))})
	if none.Total != 0 {
		t.Fatalf("total = %d", none.Total)
	}
	if got := counts(none.Facets.Platforms); len(got) != 1 || got["steam"] != 0 {
		t.Errorf("platforms = %v, want only steam with 0", got)
	}
	if none.Facets.Regions == nil || len(none.Facets.Regions) != 0 {
		t.Errorf("regions = %v, want an empty non-nil list", none.Facets.Regions)
	}
	// priceRange ignores the price filter itself: it still describes the Steam products.
	if none.Facets.PriceRange == nil {
		t.Error("priceRange must ignore the price filter")
	}

	// An unknown slug matches nothing and is not invented as a facet entry.
	unknown := list(t, s, catalog.Filter{Platforms: []string{"no-such-platform"}})
	if unknown.Total != 0 {
		t.Errorf("unknown platform total = %d", unknown.Total)
	}
	if _, ok := counts(unknown.Facets.Platforms)["no-such-platform"]; ok {
		t.Error("an unknown slug must not appear in the facets")
	}
}

func TestFacets_priceRangeIgnoresPriceFilterButFollowsOthers(t *testing.T) {
	s := newStore(t)
	all := list(t, s, catalog.Filter{}).Facets.PriceRange

	withPrice := list(t, s, catalog.Filter{MinPrice: ptr(int64(1000)), MaxPrice: ptr(int64(1500))}).Facets.PriceRange
	if all == nil || withPrice == nil || *all != *withPrice {
		t.Errorf("price filter changed the price range: %+v vs %+v", all, withPrice)
	}

	psn := list(t, s, catalog.Filter{Platforms: []string{"psn"}}).Facets.PriceRange
	var min, max int64 = 1 << 60, 0
	for _, it := range allItems(t, s, catalog.Filter{Platforms: []string{"psn"}}) {
		if it.PriceCents != nil {
			min, max = minI(min, *it.PriceCents), maxI(max, *it.PriceCents)
		}
	}
	if psn == nil || psn.MinCents != min || psn.MaxCents != max {
		t.Errorf("psn price range = %+v, want {%d %d}", psn, min, max)
	}
}

// ---- product page ----------------------------------------------------------

func TestGetProduct_witcher(t *testing.T) {
	d, err := newStore(t).GetProduct(context.Background(), witcher)
	if err != nil {
		t.Fatal(err)
	}

	if d.Product.Slug != witcher || d.Product.Edition != "Standard" ||
		d.Product.Platform.Slug != "steam" || d.Product.Region.Slug != "global" {
		t.Errorf("product = %+v", d.Product)
	}
	if d.Product.PriceCents == nil || *d.Product.PriceCents != 1099 || !d.Product.InStock ||
		d.Product.MSRPCents == nil || *d.Product.MSRPCents != 3999 {
		t.Errorf("product price fields = %+v", d.Product)
	}
	if d.Game.Title != "The Witcher 3: Wild Hunt" || d.Game.Genres == nil {
		t.Errorf("game = %+v", d.Game)
	}
	if d.Game.ReleaseDate == nil || *d.Game.ReleaseDate != "2015-05-19" {
		t.Errorf("releaseDate = %v, want 2015-05-19", d.Game.ReleaseDate)
	}

	// Offers (Task 08 report): 10.99, 12.99, 18.99 (new seller), 25.99 - cheapest first.
	wantPrices := []int64{1099, 1299, 1899, 2599}
	if len(d.Offers) != len(wantPrices) {
		t.Fatalf("offers = %d, want %d: %+v", len(d.Offers), len(wantPrices), d.Offers)
	}
	for i, o := range d.Offers {
		if o.PriceCents != wantPrices[i] {
			t.Errorf("offer %d price = %d, want %d", i, o.PriceCents, wantPrices[i])
		}
		if o.Stock <= 0 {
			t.Errorf("offer %d has stock %d: offers without stock must not be listed", i, o.Stock)
		}
	}

	retro, quest, fresh, kiosk := d.Offers[0].Seller, d.Offers[1].Seller, d.Offers[2].Seller, d.Offers[3].Seller
	if retro.Slug != "retro-ridge" || retro.Rating == nil || *retro.Rating != 7.38 || retro.RatingLabel != nil || retro.IsNew {
		t.Errorf("retro-ridge (7.38, no label) = %+v", retro)
	}
	if quest.RatingLabel == nil || *quest.RatingLabel != "Good" {
		t.Errorf("quest-depot (8.46) label = %v, want Good", quest.RatingLabel)
	}
	// The New seller: rating NULL, isNew true, no label.
	if fresh.Slug != "fresh-start-keys" || fresh.Rating != nil || !fresh.IsNew || fresh.RatingLabel != nil || fresh.ReviewsCount != 0 {
		t.Errorf("fresh-start-keys = %+v, want rating null, isNew true", fresh)
	}
	if kiosk.RatingLabel == nil || *kiosk.RatingLabel != "Excellent" || kiosk.ReviewsCount != 9875 {
		t.Errorf("keystone-kiosk (9.63) = %+v", kiosk)
	}
	if d.Offers[0].Stock != 6 || d.Offers[3].Stock != 2 { // Task 08 report: stock 6 ... 2
		t.Errorf("stock = %d / %d, want 6 / 2", d.Offers[0].Stock, d.Offers[3].Stock)
	}

	// Variants: the other products of the same game, never the product itself.
	var found bool
	for _, v := range d.Variants {
		if v.Slug == witcher {
			t.Error("variants must not contain the product itself")
		}
		if v.Slug == "the-witcher-3-wild-hunt-game-of-the-year-edition-steam-global" {
			found = true
			if v.Edition == "Standard" || v.PriceCents == nil || *v.PriceCents != 2999 || !v.InStock {
				t.Errorf("GOTY variant = %+v", v)
			}
		}
	}
	if !found {
		t.Errorf("GOTY edition missing from variants: %+v", d.Variants)
	}
}

func TestGetProduct_outOfStockProduct(t *testing.T) {
	d, err := newStore(t).GetProduct(context.Background(), "hades-psn-global") // out of stock (Task 08 report)
	if err != nil {
		t.Fatal(err)
	}
	if d.Product.InStock || d.Product.PriceCents != nil {
		t.Errorf("product = %+v, want out of stock with a null price", d.Product)
	}
	if d.Offers == nil || len(d.Offers) != 0 {
		t.Errorf("offers = %v, want an empty non-nil list", d.Offers)
	}
	if d.Variants == nil {
		t.Error("variants must be a non-nil list")
	}
}

func TestGetProduct_unknownSlug(t *testing.T) {
	_, err := newStore(t).GetProduct(context.Background(), "no-such-product")
	if !errors.Is(err, catalog.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestStore_respectsCancelledContext(t *testing.T) {
	s := newStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Nanosecond)
	defer cancel()
	time.Sleep(time.Millisecond)
	if _, err := s.ListProducts(ctx, catalog.Filter{Sort: catalog.SortPopularity, Page: 1, PageSize: 10}); err == nil {
		t.Error("expected an error for an expired context")
	}
}

// ---- helpers ---------------------------------------------------------------

func ptr[T any](v T) *T { return &v }

func equalCounts(a, b map[string]int64) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func minI(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

func maxI(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// GameID is what the home product rows de-duplicate by: it must be filled for every card, products of the
// same game share it, and different titles never do.
func TestListProducts_gameIDIdentifiesTheGame(t *testing.T) {
	items := allItems(t, newStore(t), catalog.Filter{})
	titleOfGame := map[int64]string{}
	gamesWithManyVersions := 0
	versions := map[int64]int{}
	for _, it := range items {
		if it.GameID == 0 {
			t.Fatalf("%s has no game id", it.Slug)
		}
		if title, ok := titleOfGame[it.GameID]; ok && title != it.Title {
			t.Errorf("game %d has two titles: %q and %q", it.GameID, title, it.Title)
		}
		titleOfGame[it.GameID] = it.Title
		versions[it.GameID]++
	}
	for _, n := range versions {
		if n > 1 {
			gamesWithManyVersions++
		}
	}
	if gamesWithManyVersions == 0 {
		t.Error("no game has more than one product in the seed: the check above proves nothing")
	}
}
