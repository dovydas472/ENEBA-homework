package seedgen

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// CatalogTables in dependency order: children first. Deleting in this order never
// breaks a foreign key (all FKs are ON DELETE RESTRICT); inserting goes the other way.
var CatalogTables = []string{"keys", "offers", "products", "game_aliases", "sellers", "games", "regions", "platforms"}

// TableCount is the number of rows in one table.
type TableCount struct {
	Table string
	Rows  int64
}

// Lock blocks other writers of the catalog until the transaction ends, so the
// "is it empty?" check and the inserts cannot race with a second seed run
// (the second one waits, then sees the data and refuses). Readers are not blocked.
func Lock(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, "LOCK TABLE platforms, regions, games, game_aliases, products, sellers, offers, keys IN SHARE ROW EXCLUSIVE MODE")
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
	if err := refuseWhenOrdersExist(ctx, tx); err != nil {
		return err
	}
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

// ErrOrdersExist is returned by Reset when orders exist: they reference offers and keys (RESTRICT),
// so the catalog cannot be rewritten under them, and deleting them silently would destroy order history.
var ErrOrdersExist = errors.New("seedgen: orders exist")

// refuseWhenOrdersExist stops a reset before anything is deleted, with a message that says why
// (instead of a raw foreign-key error halfway through). The orders table is checked only when it
// exists, so a database that is not yet migrated to the checkout schema can still be reset.
func refuseWhenOrdersExist(ctx context.Context, tx pgx.Tx) error {
	var exists bool
	if err := tx.QueryRow(ctx, "SELECT to_regclass('orders') IS NOT NULL").Scan(&exists); err != nil {
		return fmt.Errorf("check for orders: %w", err)
	}
	if !exists {
		return nil
	}
	var n int64
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM orders").Scan(&n); err != nil {
		return fmt.Errorf("count orders: %w", err)
	}
	if n > 0 {
		return fmt.Errorf("%w: %d order(s) reference the catalog; --reset would break them. "+
			"Order history is never deleted by a seed - use an empty database (or delete the demo orders on purpose first)", ErrOrdersExist, n)
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

	if _, err := copyAliases(ctx, tx, c.Games, gameID); err != nil {
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

// aliasRows lists the search aliases as two parallel columns, in game order, then alias order.
// That order decides the ids, so it is the same for a full seed (Insert) and InsertAliases.
func aliasRows(games []Game, gameID map[string]int64) (gameIDs []int64, aliases []string) {
	for _, g := range games {
		for _, a := range g.Aliases {
			gameIDs = append(gameIDs, gameID[g.Slug])
			aliases = append(aliases, a)
		}
	}
	return gameIDs, aliases
}

// copyAliases writes all search aliases with COPY (full seed: the table was just emptied).
func copyAliases(ctx context.Context, tx pgx.Tx, games []Game, gameID map[string]int64) (int, error) {
	gameIDs, aliases := aliasRows(games, gameID)
	rows := make([][]any, len(aliases))
	for i := range aliases {
		rows[i] = []any{gameIDs[i], aliases[i]}
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"game_aliases"},
		[]string{"game_id", "alias"}, pgx.CopyFromRows(rows)); err != nil {
		return 0, fmt.Errorf("copy game aliases: %w", err)
	}
	return len(rows), nil
}

// AliasCounts is what InsertAliases reports: rows before, rows it added, rows after.
type AliasCounts struct {
	Before, Inserted, After int64
}

// insertMissingAliasesSQL adds the snapshot's aliases that are not there yet. unnest(...) WITH ORDINALITY
// turns the two arrays into rows numbered 1, 2, 3 …; ORDER BY ord keeps the snapshot order, so new ids
// are handed out in the same order as in a full seed. ON CONFLICT on the unique index
// (game_id, lower(alias)) skips an alias that already exists instead of failing the transaction.
const insertMissingAliasesSQL = `
INSERT INTO game_aliases (game_id, alias)
SELECT t.game_id, t.alias
FROM unnest($1::bigint[], $2::text[]) WITH ORDINALITY AS t(game_id, alias, ord)
ORDER BY t.ord
ON CONFLICT (game_id, lower(alias)) DO NOTHING`

// InsertAliases adds the snapshot's search aliases that are MISSING from game_aliases (Task 18).
//
// Why it exists: production got the aliases table (migration 00003) but its re-seed failed, and a
// full re-seed (--reset) now refuses because orders exist. Aliases are referenced by nothing, so
// adding them touches no order, offer or key.
//
// Idempotent: running it twice is safe - the second run inserts 0 rows (ON CONFLICT DO NOTHING).
// The games must already be in the database (same snapshot): every catalog game is looked up by
// slug, and a missing one stops the run before anything is written.
// When the table is EMPTY the identity restarts at 1 first, so the ids come out exactly as on a
// database seeded in one go (dev) - the integration test checks that with Checksum.
// Call it inside a transaction after Lock.
func InsertAliases(ctx context.Context, tx pgx.Tx, c Catalog) (AliasCounts, error) {
	var n AliasCounts
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM game_aliases").Scan(&n.Before); err != nil {
		return n, fmt.Errorf("count game aliases: %w", err)
	}
	gameID, err := idsBySlug(ctx, tx, "games")
	if err != nil {
		return n, err
	}
	for _, g := range c.Games {
		if _, ok := gameID[g.Slug]; !ok {
			return n, fmt.Errorf("game %q of the snapshot is not in the database; the catalog differs from the snapshot, nothing was changed", g.Slug)
		}
	}
	if n.Before == 0 {
		// Empty table: restarting the identity cannot clash with an existing id. Transactional, so a
		// later failure rolls the counter back too.
		if _, err := tx.Exec(ctx, "ALTER TABLE game_aliases ALTER COLUMN id RESTART WITH 1"); err != nil {
			return n, fmt.Errorf("restart identity of game_aliases: %w", err)
		}
	}
	gameIDs, aliases := aliasRows(c.Games, gameID)
	tag, err := tx.Exec(ctx, insertMissingAliasesSQL, gameIDs, aliases)
	if err != nil {
		return n, fmt.Errorf("insert missing game aliases: %w", err)
	}
	n.Inserted = tag.RowsAffected()
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM game_aliases").Scan(&n.After); err != nil {
		return n, fmt.Errorf("count game aliases: %w", err)
	}
	return n, nil
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
    UNION ALL
    SELECT 8, id, format('%L|%L|%L', id, game_id, alias) FROM game_aliases
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
