package seedgen

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// CatalogTables in dependency order: children first. Deleting in this order never
// breaks a foreign key (all FKs are ON DELETE RESTRICT); inserting goes the other way.
var CatalogTables = []string{"keys", "offers", "products", "sellers", "games", "regions", "platforms"}

// TableCount is the number of rows in one table.
type TableCount struct {
	Table string
	Rows  int64
}

// Lock blocks other writers of the catalog until the transaction ends, so the
// "is it empty?" check and the inserts cannot race with a second seed run
// (the second one waits, then sees the data and refuses). Readers are not blocked.
func Lock(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, "LOCK TABLE platforms, regions, games, products, sellers, offers, keys IN SHARE ROW EXCLUSIVE MODE")
	return err
}

// Counts returns the row count of every catalog table (in CatalogTables order).
func Counts(ctx context.Context, tx pgx.Tx) ([]TableCount, error) {
	var out []TableCount
	for _, t := range CatalogTables {
		var n int64
		// t comes from the fixed list above, never from user input.
		if err := tx.QueryRow(ctx, "SELECT count(*) FROM "+t).Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, TableCount{t, n})
	}
	return out, nil
}

// Reset deletes all catalog rows (children first) and restarts every identity at 1,
// so the same snapshot always gets the same ids. Both steps are transactional in
// Postgres: if the seed fails later, the ROLLBACK brings the old data AND the old
// identity counters back. (setval() would NOT be rolled back, so it is not used.)
func Reset(ctx context.Context, tx pgx.Tx) error {
	for _, t := range CatalogTables {
		if _, err := tx.Exec(ctx, "DELETE FROM "+t); err != nil {
			return fmt.Errorf("delete from %s: %w", t, err)
		}
		if _, err := tx.Exec(ctx, "ALTER TABLE "+t+" ALTER COLUMN id RESTART WITH 1"); err != nil {
			return fmt.Errorf("restart identity of %s: %w", t, err)
		}
	}
	return nil
}

// Insert writes the catalog, parents first.
//
// The three tiny lookup tables use plain INSERT ... RETURNING id. The bigger
// tables use pgx.CopyFrom: Postgres' COPY protocol streams all rows in ONE
// round trip, instead of one INSERT (one network round trip) per row - for
// ~2 000 keys that is the difference between seconds and milliseconds.
// COPY does not return ids, so afterwards the ids are read back by natural key
// (slug, or product+seller for offers).
func Insert(ctx context.Context, tx pgx.Tx, c Catalog) error {
	platformID := map[string]int64{}
	for _, p := range c.Platforms {
		var id int64
		if err := tx.QueryRow(ctx,
			"INSERT INTO platforms (slug, name, sort_order) VALUES ($1, $2, $3) RETURNING id",
			p.Slug, p.Name, p.SortOrder).Scan(&id); err != nil {
			return fmt.Errorf("insert platform %s: %w", p.Slug, err)
		}
		platformID[p.Slug] = id
	}

	regionID := map[string]int64{}
	for _, r := range c.Regions {
		var id int64
		if err := tx.QueryRow(ctx,
			"INSERT INTO regions (slug, name, sort_order) VALUES ($1, $2, $3) RETURNING id",
			r.Slug, r.Name, r.SortOrder).Scan(&id); err != nil {
			return fmt.Errorf("insert region %s: %w", r.Slug, err)
		}
		regionID[r.Slug] = id
	}

	sellerID := map[string]int64{}
	for _, s := range c.Sellers {
		var id int64
		// The rating travels as text and is cast by Postgres to numeric(4,2): no float in Go.
		if err := tx.QueryRow(ctx,
			"INSERT INTO sellers (slug, name, rating, reviews_count) VALUES ($1, $2, $3::text::numeric, $4) RETURNING id",
			s.Slug, s.Name, s.Rating, s.ReviewsCount).Scan(&id); err != nil {
			return fmt.Errorf("insert seller %s: %w", s.Slug, err)
		}
		sellerID[s.Slug] = id
	}

	// games
	gameRows := make([][]any, len(c.Games))
	for i, g := range c.Games {
		var release any // nil interface = NULL
		if g.ReleaseDate != nil {
			release = *g.ReleaseDate
		}
		gameRows[i] = []any{g.Slug, g.Title, g.Description, g.Genres, release, g.Developer, g.Publisher, g.CoverURL, g.Popularity, g.IGDBID}
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"games"},
		[]string{"slug", "title", "description", "genres", "release_date", "developer", "publisher", "cover_url", "popularity", "igdb_id"},
		pgx.CopyFromRows(gameRows)); err != nil {
		return fmt.Errorf("copy games: %w", err)
	}
	gameID, err := idsBySlug(ctx, tx, "games")
	if err != nil {
		return err
	}

	// products
	productRows := make([][]any, len(c.Products))
	for i, p := range c.Products {
		productRows[i] = []any{gameID[p.GameSlug], platformID[p.PlatformSlug], regionID[p.RegionSlug], p.Edition, p.Slug, p.MSRPCents}
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"products"},
		[]string{"game_id", "platform_id", "region_id", "edition", "slug", "msrp_cents"},
		pgx.CopyFromRows(productRows)); err != nil {
		return fmt.Errorf("copy products: %w", err)
	}
	productID, err := idsBySlug(ctx, tx, "products")
	if err != nil {
		return err
	}

	// offers
	offerRows := make([][]any, len(c.Offers))
	for i, o := range c.Offers {
		offerRows[i] = []any{productID[o.ProductSlug], sellerID[o.SellerSlug], o.PriceCents, o.IsActive}
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"offers"},
		[]string{"product_id", "seller_id", "price_cents", "is_active"},
		pgx.CopyFromRows(offerRows)); err != nil {
		return fmt.Errorf("copy offers: %w", err)
	}
	type offerKey struct{ product, seller int64 }
	offerID := map[offerKey]int64{}
	rows, err := tx.Query(ctx, "SELECT id, product_id, seller_id FROM offers")
	if err != nil {
		return fmt.Errorf("read offer ids: %w", err)
	}
	for rows.Next() {
		var id int64
		var k offerKey
		if err := rows.Scan(&id, &k.product, &k.seller); err != nil {
			rows.Close()
			return fmt.Errorf("read offer ids: %w", err)
		}
		offerID[k] = id
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read offer ids: %w", err)
	}

	// keys
	keyRows := make([][]any, len(c.Keys))
	for i, k := range c.Keys {
		id := offerID[offerKey{productID[k.ProductSlug], sellerID[k.SellerSlug]}]
		keyRows[i] = []any{id, k.Code, k.Status, k.ReservedUntil, k.SoldAt, k.CreatedAt}
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"keys"},
		[]string{"offer_id", "code", "status", "reserved_until", "sold_at", "created_at"},
		pgx.CopyFromRows(keyRows)); err != nil {
		return fmt.Errorf("copy keys: %w", err)
	}
	return nil
}

// idsBySlug reads slug -> id for a table that was just filled with COPY.
func idsBySlug(ctx context.Context, tx pgx.Tx, table string) (map[string]int64, error) {
	rows, err := tx.Query(ctx, "SELECT id, slug FROM "+table) // table is a constant from Insert
	if err != nil {
		return nil, fmt.Errorf("read %s ids: %w", table, err)
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var id int64
		var slug string
		if err := rows.Scan(&id, &slug); err != nil {
			return nil, fmt.Errorf("read %s ids: %w", table, err)
		}
		out[slug] = id
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read %s ids: %w", table, err)
	}
	return out, nil
}

// checksumSQL turns the whole catalog into text, row by row in a fixed order
// (table, then id), and hashes it. format('%L') writes NULL as NULL and text in
// quotes, so NULL and ” differ. Timestamps are compared as Unix seconds (not as
// text, which would depend on the session time zone). Columns filled by now()
// (created_at / updated_at of most tables) are left out: they differ per run by design.
const checksumSQL = `
SELECT md5(string_agg(line, E'\n' ORDER BY tbl, id))
FROM (
    SELECT 1 AS tbl, id, format('%L|%L|%L|%L', id, slug, name, sort_order) AS line FROM platforms
    UNION ALL
    SELECT 2, id, format('%L|%L|%L|%L', id, slug, name, sort_order) FROM regions
    UNION ALL
    SELECT 3, id, format('%L|%L|%L|%L|%L|%L|%L|%L|%L|%L|%L', id, slug, title, description, genres,
                         release_date, developer, publisher, cover_url, popularity, igdb_id) FROM games
    UNION ALL
    SELECT 4, id, format('%L|%L|%L|%L|%L|%L|%L', id, game_id, platform_id, region_id, edition, slug, msrp_cents) FROM products
    UNION ALL
    SELECT 5, id, format('%L|%L|%L|%L|%L', id, slug, name, rating, reviews_count) FROM sellers
    UNION ALL
    SELECT 6, id, format('%L|%L|%L|%L|%L', id, product_id, seller_id, price_cents, is_active) FROM offers
    UNION ALL
    SELECT 7, id, format('%L|%L|%L|%L|%L|%L|%L', id, offer_id, code, status,
                         extract(epoch FROM reserved_until)::bigint,
                         extract(epoch FROM sold_at)::bigint,
                         extract(epoch FROM created_at)::bigint) FROM keys
) AS rows_as_text`

// Checksum returns an MD5 of the ordered catalog content. Two databases with the
// same checksum hold the same catalog (the seed prints it, so dev and production
// can be compared). MD5 is fine here: it detects differences, it protects nothing.
func Checksum(ctx context.Context, tx pgx.Tx) (string, error) {
	var sum *string
	if err := tx.QueryRow(ctx, checksumSQL).Scan(&sum); err != nil {
		return "", err
	}
	if sum == nil {
		return "(empty catalog)", nil
	}
	return *sum, nil
}
