// Integration tests for InsertAliases (Task 18) on a real Postgres (pkg/testdb).
// They skip when TEST_DATABASE_URL is empty; CI's `migrations` job runs them.
// Every test works inside a transaction that is rolled back, so the shared seeded database is unchanged.
package seedgen_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
	"github.com/dovydas472/ENEBA-homework/pkg/seedgen"
	"github.com/dovydas472/ENEBA-homework/pkg/testdb"
	"github.com/dovydas472/ENEBA-homework/seed"
)

// testCatalog builds the same catalog as cmd/seed.
func testCatalog(t *testing.T) seedgen.Catalog {
	t.Helper()
	snap, err := igdb.ParseSnapshot(seed.SnapshotJSON)
	if err != nil {
		t.Fatal(err)
	}
	extra, err := seedgen.ParseExtraAliases(seed.ExtraAliasesJSON)
	if err != nil {
		t.Fatal(err)
	}
	c, err := seedgen.Generate(snap, extra)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// beginLocked opens a transaction (rolled back at the end of the test) and takes the seed's lock.
func beginLocked(t *testing.T) (context.Context, pgx.Tx) {
	t.Helper()
	pool := testdb.Pool(t)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	if err := seedgen.Lock(ctx, tx); err != nil {
		t.Fatal(err)
	}
	return ctx, tx
}

func checksum(ctx context.Context, t *testing.T, tx pgx.Tx) string {
	t.Helper()
	sum, err := seedgen.Checksum(ctx, tx)
	if err != nil {
		t.Fatal(err)
	}
	return sum
}

// snapshotAliasCount is the number of aliases the snapshot (+ hand-written extras) defines.
func snapshotAliasCount(c seedgen.Catalog) int64 {
	var n int64
	for _, g := range c.Games {
		n += int64(len(g.Aliases))
	}
	return n
}

// The production case: everything is seeded except the aliases. Afterwards the catalog must be
// exactly what a one-go seed produces (same alias rows AND ids), proven by the checksum.
func TestInsertAliases_fillsAnEmptyTableLikeAFullSeed(t *testing.T) {
	ctx, tx := beginLocked(t)
	cat := testCatalog(t)
	want := checksum(ctx, t, tx) // the seeded database, aliases included
	total := snapshotAliasCount(cat)

	if _, err := tx.Exec(ctx, "DELETE FROM game_aliases"); err != nil {
		t.Fatal(err)
	}
	n, err := seedgen.InsertAliases(ctx, tx, cat)
	if err != nil {
		t.Fatal(err)
	}
	if total == 0 || n != (seedgen.AliasCounts{Before: 0, Inserted: total, After: total}) {
		t.Fatalf("counts = %+v, want before 0, inserted %d, after %d", n, total, total)
	}
	if got := checksum(ctx, t, tx); got != want {
		t.Fatalf("checksum after InsertAliases = %s, want the full-seed checksum %s (rows or ids differ)", got, want)
	}
}

// Idempotent: on a database that already has every alias, a run inserts nothing and changes nothing.
func TestInsertAliases_secondRunInsertsNothing(t *testing.T) {
	ctx, tx := beginLocked(t)
	cat := testCatalog(t)
	before := checksum(ctx, t, tx)
	total := snapshotAliasCount(cat)

	for run := 1; run <= 2; run++ {
		n, err := seedgen.InsertAliases(ctx, tx, cat)
		if err != nil {
			t.Fatalf("run %d: %v", run, err)
		}
		if n != (seedgen.AliasCounts{Before: total, Inserted: 0, After: total}) {
			t.Fatalf("run %d: counts = %+v, want before = after = %d, inserted 0", run, n, total)
		}
	}
	if got := checksum(ctx, t, tx); got != before {
		t.Fatal("the catalog changed although every alias already existed")
	}
}

// Only the missing rows are added: aliases that exist (even in another letter case) are skipped,
// and a row that is not in the snapshot is left alone (the tool never deletes).
func TestInsertAliases_addsOnlyMissingRows(t *testing.T) {
	ctx, tx := beginLocked(t)
	cat := testCatalog(t)
	total := snapshotAliasCount(cat)

	// Remove the aliases of the first game that has some, and upper-case one of another game.
	var first, other seedgen.Game
	for _, g := range cat.Games {
		if len(g.Aliases) == 0 {
			continue
		}
		if first.Slug == "" {
			first = g
		} else if other.Slug == "" {
			other = g
		}
	}
	if first.Slug == "" || other.Slug == "" {
		t.Fatal("the snapshot needs two games with aliases for this test")
	}
	tag, err := tx.Exec(ctx, "DELETE FROM game_aliases WHERE game_id = (SELECT id FROM games WHERE slug = $1)", first.Slug)
	if err != nil {
		t.Fatal(err)
	}
	removed := tag.RowsAffected()
	if _, err := tx.Exec(ctx, "UPDATE game_aliases SET alias = upper(alias) WHERE alias = $1 AND game_id = (SELECT id FROM games WHERE slug = $2)",
		other.Aliases[0], other.Slug); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "INSERT INTO game_aliases (game_id, alias) SELECT id, 'not in the snapshot' FROM games WHERE slug = $1", other.Slug); err != nil {
		t.Fatal(err)
	}

	n, err := seedgen.InsertAliases(ctx, tx, cat)
	if err != nil {
		t.Fatal(err)
	}
	want := seedgen.AliasCounts{Before: total - removed + 1, Inserted: removed, After: total + 1}
	if removed == 0 || n != want {
		t.Fatalf("counts = %+v, want %+v", n, want)
	}
}

// A database whose games do not match the snapshot gets no aliases (they could point at the wrong game).
func TestInsertAliases_refusesWhenAGameIsMissing(t *testing.T) {
	ctx, tx := beginLocked(t)
	cat := testCatalog(t)
	if _, err := tx.Exec(ctx, "DELETE FROM game_aliases"); err != nil {
		t.Fatal(err)
	}
	// Rename one game instead of deleting it (products reference it; RESTRICT).
	if _, err := tx.Exec(ctx, "UPDATE games SET slug = slug || '-renamed' WHERE slug = $1", cat.Games[0].Slug); err != nil {
		t.Fatal(err)
	}
	if _, err := seedgen.InsertAliases(ctx, tx, cat); err == nil {
		t.Fatal("InsertAliases accepted a database without the snapshot's first game")
	}
	var n int64
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM game_aliases").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("%d aliases were written although the run was refused", n)
	}
}
