package catalog

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PoolSource hands the Store its connection pool. *db.Lazy (pkg/db) implements
// it: the pool is created on first use, so a missing DATABASE_URL does not
// crash the function at start-up.
type PoolSource interface {
	Pool() (*pgxpool.Pool, error)
}

// fixedPool adapts an already built pool (used by tests) to PoolSource.
type fixedPool struct{ p *pgxpool.Pool }

func (f fixedPool) Pool() (*pgxpool.Pool, error) { return f.p, nil }

// Store runs the catalog queries. It has no state besides the pool source.
type Store struct{ src PoolSource }

// NewStore builds a Store on a (lazy) pool source.
func NewStore(src PoolSource) *Store { return &Store{src: src} }

// NewStoreFromPool builds a Store on a ready pool.
func NewStoreFromPool(p *pgxpool.Pool) *Store { return &Store{src: fixedPool{p}} }

// ---------------------------------------------------------------------------
// SQL building blocks (docs/DATA_MODEL.md, "Query sketches").
//
// All SQL is made of CONSTANTS in this file. User input only ever travels as
// query PARAMETERS (@name, rewritten by pgx to $1, $2 ...), never as SQL text.
// The one dynamic part, ORDER BY, is picked from the fixed `orderBy` map below.
// ---------------------------------------------------------------------------

// sellableKey is true for a key that can be bought now: available, or reserved
// but the reservation has expired. "status <> 'sold'" is written exactly like
// the predicate of the partial index keys_unsold_offer_idx so it can be used.
const sellableKey = `k.status <> 'sold' AND (k.reserved_until IS NULL OR k.reserved_until < now())`

// statsCTEs: one row per product that has active offers - its cheapest price
// and the number of offers that can be bought now (offers with stock).
// min_price_cents is NULL when no active offer has stock = "out of stock".
const statsCTEs = `
active_offers AS (
    SELECT o.product_id, o.price_cents,
           EXISTS (SELECT 1 FROM keys k WHERE k.offer_id = o.id AND ` + sellableKey + `) AS has_stock
    FROM offers o
    WHERE o.is_active
),
product_stats AS (
    SELECT product_id,
           min(price_cents) FILTER (WHERE has_stock) AS min_price_cents,
           count(*)         FILTER (WHERE has_stock) AS offer_count
    FROM active_offers
    GROUP BY product_id
)`

// baseCTE is "every product with everything the listing and the facets need".
// ITEMS AND ALL FACETS READ FROM THIS ONE CTE, so a condition added to its WHERE
// applies to all of them at once. The future text search adds exactly one line
// there (e.g. AND g.title ILIKE ...), and the facets follow the search for free.
const baseCTE = `
WITH ` + statsCTEs + `,
base AS (
    SELECT p.id, p.slug, p.edition, p.msrp_cents,
           g.title, g.cover_url, g.release_date, g.popularity,
           pl.id AS platform_id, pl.slug AS platform_slug, pl.name AS platform_name,
           r.id  AS region_id,   r.slug  AS region_slug,   r.name  AS region_name,
           ps.min_price_cents,
           coalesce(ps.offer_count, 0) AS offer_count,
           CASE WHEN ps.min_price_cents < p.msrp_cents
                THEN (p.msrp_cents - ps.min_price_cents)::bigint * 100 / p.msrp_cents
           END AS discount_pct
    FROM products p
    LEFT JOIN product_stats ps ON ps.product_id = p.id
    JOIN games     g  ON g.id  = p.game_id
    JOIN platforms pl ON pl.id = p.platform_id
    JOIN regions   r  ON r.id  = p.region_id
    WHERE true  -- the search task adds its condition HERE (see the comment above)
)`

// The three filters as conditions on a base row (alias b). Each facet query
// uses every filter EXCEPT its own group's. Parameters:
//
//	@platforms, @regions  text[]   (empty array = no filter)
//	@min_price, @max_price bigint  (NULL = no bound)
const (
	platformMatch = `(cardinality(@platforms::text[]) = 0 OR b.platform_slug = ANY(@platforms::text[]))`
	regionMatch   = `(cardinality(@regions::text[]) = 0 OR b.region_slug = ANY(@regions::text[]))`
	// A NULL price (out of stock) never satisfies a comparison, so out-of-stock
	// products drop out as soon as a price bound is given.
	priceMatch = `(@min_price::bigint IS NULL OR b.min_price_cents >= @min_price::bigint)
              AND (@max_price::bigint IS NULL OR b.min_price_cents <= @max_price::bigint)`
)

// orderBy: one fixed ORDER BY per Sort. "b.id" last keeps paging stable when
// two products tie. Out-of-stock products (NULL price) go last for the price
// and discount sorts.
var orderBy = map[Sort]string{
	SortPopularity: `b.popularity DESC, b.id`,
	SortPriceAsc:   `b.min_price_cents ASC NULLS LAST, b.id`,
	SortPriceDesc:  `b.min_price_cents DESC NULLS LAST, b.id`,
	SortDiscount:   `(b.min_price_cents IS NULL), b.discount_pct DESC NULLS LAST, b.id`,
	SortNewest:     `b.release_date DESC NULLS LAST, b.id`,
	SortTitle:      `b.title ASC, b.id`,
}

const itemsSQL = baseCTE + `
SELECT b.slug, b.title, b.edition,
       b.platform_slug, b.platform_name, b.region_slug, b.region_name,
       b.cover_url, b.min_price_cents, b.msrp_cents, b.discount_pct, b.offer_count,
       b.min_price_cents IS NOT NULL AS in_stock,
       count(*) OVER () AS total            -- all matching rows, before LIMIT
FROM base b
WHERE ` + platformMatch + ` AND ` + regionMatch + ` AND ` + priceMatch + `
ORDER BY %s
LIMIT @limit OFFSET @offset`

// totalSQL is only used when a page is past the last one (no rows, so
// count(*) OVER () has nothing to report).
const totalSQL = baseCTE + `
SELECT count(*) FROM base b
WHERE ` + platformMatch + ` AND ` + regionMatch + ` AND ` + priceMatch

// Platform facet: counted with the region and price filters, NOT the platform
// filter. Entries with count 0 are hidden unless the platform is selected.
const platformFacetSQL = baseCTE + `
SELECT pl.slug, pl.name, count(b.id) AS cnt
FROM platforms pl
LEFT JOIN base b ON b.platform_id = pl.id AND ` + regionMatch + ` AND ` + priceMatch + `
GROUP BY pl.id
HAVING count(b.id) > 0 OR pl.slug = ANY(@platforms::text[])
ORDER BY pl.sort_order, pl.id`

// Region facet: the same, with the platform and price filters.
const regionFacetSQL = baseCTE + `
SELECT r.slug, r.name, count(b.id) AS cnt
FROM regions r
LEFT JOIN base b ON b.region_id = r.id AND ` + platformMatch + ` AND ` + priceMatch + `
GROUP BY r.id
HAVING count(b.id) > 0 OR r.slug = ANY(@regions::text[])
ORDER BY r.sort_order, r.id`

// Price range: over in-stock products (min/max ignore NULL prices) that match
// the platform and region filters - not the price filter itself.
const priceRangeSQL = baseCTE + `
SELECT min(b.min_price_cents), max(b.min_price_cents)
FROM base b
WHERE ` + platformMatch + ` AND ` + regionMatch

// ListProducts returns one page of the listing and the facets for the same
// filters. Items and the three facet queries are sent to Postgres together in
// ONE batch: one network round trip, and one implicit transaction, so the
// items and the counts come from the same snapshot of the data.
func (s *Store) ListProducts(ctx context.Context, f Filter) (Page, error) {
	order, ok := orderBy[f.Sort]
	if !ok {
		return Page{}, fmt.Errorf("catalog: unknown sort %q", f.Sort)
	}
	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 || f.PageSize > MaxPageSize {
		f.PageSize = DefaultPageSize
	}
	pool, err := s.src.Pool()
	if err != nil {
		return Page{}, err
	}

	// A nil slice would be sent as SQL NULL, and cardinality(NULL) is NULL: use empty slices.
	platforms, regions := f.Platforms, f.Regions
	if platforms == nil {
		platforms = []string{}
	}
	if regions == nil {
		regions = []string{}
	}
	filterArgs := func() pgx.NamedArgs {
		return pgx.NamedArgs{"platforms": platforms, "regions": regions, "min_price": f.MinPrice, "max_price": f.MaxPrice}
	}
	itemArgs := filterArgs()
	itemArgs["limit"] = f.PageSize
	itemArgs["offset"] = (f.Page - 1) * f.PageSize

	batch := &pgx.Batch{}
	// itemsSQL has one %s: the ORDER BY line from the fixed whitelist above (never user text).
	batch.Queue(fmt.Sprintf(itemsSQL, order), itemArgs)
	batch.Queue(platformFacetSQL, filterArgs())
	batch.Queue(regionFacetSQL, filterArgs())
	batch.Queue(priceRangeSQL, filterArgs())
	br := pool.SendBatch(ctx, batch)
	defer br.Close()

	page := Page{Items: []Item{}, Page: f.Page, PageSize: f.PageSize}

	// 1. items (+ total from count(*) OVER ())
	rows, err := br.Query()
	if err != nil {
		return Page{}, fmt.Errorf("catalog: list items: %w", err)
	}
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.Slug, &it.Title, &it.Edition,
			&it.Platform.Slug, &it.Platform.Name, &it.Region.Slug, &it.Region.Name,
			&it.CoverURL, &it.PriceCents, &it.MSRPCents, &it.DiscountPercent, &it.OfferCount,
			&it.InStock, &page.Total); err != nil {
			rows.Close()
			return Page{}, fmt.Errorf("catalog: scan item: %w", err)
		}
		page.Items = append(page.Items, it)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return Page{}, fmt.Errorf("catalog: list items: %w", err)
	}

	// 2. + 3. platform and region facets
	if page.Facets.Platforms, err = readFacetOptions(br); err != nil {
		return Page{}, fmt.Errorf("catalog: platform facet: %w", err)
	}
	if page.Facets.Regions, err = readFacetOptions(br); err != nil {
		return Page{}, fmt.Errorf("catalog: region facet: %w", err)
	}

	// 4. price range (one row; both values NULL when no in-stock product matches)
	var minCents, maxCents *int64
	if err := br.QueryRow().Scan(&minCents, &maxCents); err != nil {
		return Page{}, fmt.Errorf("catalog: price range: %w", err)
	}
	if minCents != nil && maxCents != nil {
		page.Facets.PriceRange = &PriceRange{MinCents: *minCents, MaxCents: *maxCents}
	}
	if err := br.Close(); err != nil {
		return Page{}, fmt.Errorf("catalog: batch: %w", err)
	}

	// A page after the last one has no rows, so the total must be asked separately.
	if len(page.Items) == 0 && f.Page > 1 {
		if err := pool.QueryRow(ctx, totalSQL, filterArgs()).Scan(&page.Total); err != nil {
			return Page{}, fmt.Errorf("catalog: count: %w", err)
		}
	}
	return page, nil
}

func readFacetOptions(br pgx.BatchResults) ([]FacetOption, error) {
	rows, err := br.Query()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FacetOption{} // never nil: the JSON must be [] not null
	for rows.Next() {
		var o FacetOption
		if err := rows.Scan(&o.Slug, &o.Name, &o.Count); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Product page
// ---------------------------------------------------------------------------

const productSQL = `
SELECT p.slug, p.edition, p.msrp_cents,
       pl.slug, pl.name, r.slug, r.name,
       g.title, g.description, g.genres, g.release_date, g.developer, g.publisher, g.cover_url
FROM products p
JOIN games     g  ON g.id  = p.game_id
JOIN platforms pl ON pl.id = p.platform_id
JOIN regions   r  ON r.id  = p.region_id
WHERE p.slug = @slug`

// Only BUYABLE offers: active and with stock, cheapest first (DATA_MODEL.md sketch 2).
const offersSQL = `
SELECT o.id, o.price_cents, st.stock,
       s.slug, s.name, s.rating::float8, s.reviews_count
FROM products p
JOIN offers  o ON o.product_id = p.id AND o.is_active
JOIN sellers s ON s.id = o.seller_id
CROSS JOIN LATERAL (
    SELECT count(*) AS stock
    FROM keys k
    WHERE k.offer_id = o.id AND ` + sellableKey + `
) st
WHERE p.slug = @slug AND st.stock > 0
ORDER BY o.price_cents, o.id`

// The other products of the same game, with their own cheapest buyable price.
const variantsSQL = `
WITH ` + statsCTEs + `
SELECT v.slug, v.edition, pl.slug, pl.name, r.slug, r.name, ps.min_price_cents
FROM products p
JOIN products  v  ON v.game_id = p.game_id AND v.id <> p.id
JOIN platforms pl ON pl.id = v.platform_id
JOIN regions   r  ON r.id  = v.region_id
LEFT JOIN product_stats ps ON ps.product_id = v.id
WHERE p.slug = @slug
ORDER BY pl.sort_order, r.sort_order, v.edition, v.id`

// GetProduct returns the data of one product page, or ErrNotFound.
// The three queries (product, offers, variants) go out in one batch.
func (s *Store) GetProduct(ctx context.Context, slug string) (ProductDetail, error) {
	pool, err := s.src.Pool()
	if err != nil {
		return ProductDetail{}, err
	}

	args := pgx.NamedArgs{"slug": slug}
	batch := &pgx.Batch{}
	batch.Queue(productSQL, args)
	batch.Queue(offersSQL, args)
	batch.Queue(variantsSQL, args)
	br := pool.SendBatch(ctx, batch)
	defer br.Close()

	var d ProductDetail
	var release *time.Time
	err = br.QueryRow().Scan(&d.Product.Slug, &d.Product.Edition, &d.Product.MSRPCents,
		&d.Product.Platform.Slug, &d.Product.Platform.Name, &d.Product.Region.Slug, &d.Product.Region.Name,
		&d.Game.Title, &d.Game.Description, &d.Game.Genres, &release, &d.Game.Developer, &d.Game.Publisher, &d.Game.CoverURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return ProductDetail{}, ErrNotFound
	}
	if err != nil {
		return ProductDetail{}, fmt.Errorf("catalog: product: %w", err)
	}
	if release != nil {
		day := release.Format("2006-01-02") // a date, not a timestamp
		d.Game.ReleaseDate = &day
	}
	if d.Game.Genres == nil {
		d.Game.Genres = []string{}
	}

	// offers
	d.Offers = []Offer{}
	rows, err := br.Query()
	if err != nil {
		return ProductDetail{}, fmt.Errorf("catalog: offers: %w", err)
	}
	for rows.Next() {
		var o Offer
		if err := rows.Scan(&o.OfferID, &o.PriceCents, &o.Stock,
			&o.Seller.Slug, &o.Seller.Name, &o.Seller.Rating, &o.Seller.ReviewsCount); err != nil {
			rows.Close()
			return ProductDetail{}, fmt.Errorf("catalog: scan offer: %w", err)
		}
		o.Seller.RatingLabel = RatingLabel(o.Seller.Rating)
		o.Seller.IsNew = o.Seller.Rating == nil // rating NULL = a seller without reviews yet
		d.Offers = append(d.Offers, o)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return ProductDetail{}, fmt.Errorf("catalog: offers: %w", err)
	}

	// The product's own price is the first (cheapest) buyable offer.
	if len(d.Offers) > 0 {
		price := d.Offers[0].PriceCents
		d.Product.PriceCents = &price
		d.Product.InStock = true
	}

	// variants
	d.Variants = []Variant{}
	rows, err = br.Query()
	if err != nil {
		return ProductDetail{}, fmt.Errorf("catalog: variants: %w", err)
	}
	for rows.Next() {
		var v Variant
		if err := rows.Scan(&v.Slug, &v.Edition, &v.Platform.Slug, &v.Platform.Name,
			&v.Region.Slug, &v.Region.Name, &v.PriceCents); err != nil {
			rows.Close()
			return ProductDetail{}, fmt.Errorf("catalog: scan variant: %w", err)
		}
		v.InStock = v.PriceCents != nil
		d.Variants = append(d.Variants, v)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return ProductDetail{}, fmt.Errorf("catalog: variants: %w", err)
	}
	return d, br.Close()
}
