// Integration tests for InsertAliases (Task 18) on a real Postgres (pkg/testdb).
// They skip when TEST_DATABASE_URL is empty; CI's `migrations` job runs them.
// Every test works inside a transaction that is rolled back, so the shared seeded database is unchanged.
package seedgen_test

import (
	"context"
	"errors"
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

// The production case: everything is seeded except the aliases. Afterwards the catalog must be
// exactly what a one-go seed produces (same alias rows AND ids), proven by the checksum.
func TestInsertAliases_fillsAnEmptyTableLikeAFullSeed(t *testing.T) {
	ctx, tx := beginLocked(t)
	cat := testCatalog(t)
	want := checksum(ctx, t, tx) // the seeded database, aliases included

	if _, err := tx.Exec(ctx, "DELETE FROM game_aliases"); err != nil {
		t.Fatal(err)
	}
	n, err := seedgen.InsertAliases(ctx, tx, cat)
	if err != nil {
		t.Fatal(err)
	}
	wantN := 0
	for _, g := range cat.Games {
		wantN += len(g.Aliases)
	}
	if n != wantN || n == 0 {
		t.Fatalf("inserted %d aliases, want %d (> 0)", n, wantN)
	}
	if got := checksum(ctx, t, tx); got != want {
		t.Fatalf("checksum after InsertAliases = %s, want the full-seed checksum %s (rows or ids differ)", got, want)
	}
}

// A second run (or a database that already has aliases) changes nothing.
func TestInsertAliases_refusesWhenAliasesExist(t *testing.T) {
	ctx, tx := beginLocked(t)
	before := checksum(ctx, t, tx)

	_, err := seedgen.InsertAliases(ctx, tx, testCatalog(t))
	if !errors.Is(err, seedgen.ErrAliasesExist) {
		t.Fatalf("err = %v, want ErrAliasesExist", err)
	}
	if got := checksum(ctx, t, tx); got != before {
		t.Fatal("the catalog changed although InsertAliases refused")
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
