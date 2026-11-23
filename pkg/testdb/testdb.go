// Package testdb gives database integration tests a ready-to-use Postgres:
// migrated and filled with the deterministic demo catalog (pkg/seedgen) - Pool -
// or only migrated - Migrated (the auth tests need the schema, not the catalog).
//
// The database comes from TEST_DATABASE_URL. When it is empty the test is
// skipped, so `go test ./...` works on any machine; CI provides a throw-away
// Postgres container (job `migrations`). It must NEVER point at a Neon
// branch: the seed deletes and rewrites the catalog tables.
//
// REQUIRE_TEST_DB=1 turns the skip into a failure. The CI job that has a
// database sets it: a test that is silently skipped looks green but proves
// nothing, so if the database ever disappears from CI the build must go red.
//
// Packages that share this database must not run at the same time: pkg/catalog re-seeds the catalog
// (deleting every product, offer and key) while pkg/orders builds its own rows in the same tables.
// Run them one after another: `go test -p 1 ./...` (CI does).
//
// Used only from _test.go files.
package testdb

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver (goose needs database/sql)
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"

	"github.com/dovydas472/ENEBA-homework/migrations"
	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
	"github.com/dovydas472/ENEBA-homework/pkg/seedgen"
	"github.com/dovydas472/ENEBA-homework/seed"
)

const (
	envName     = "TEST_DATABASE_URL"
	requireName = "REQUIRE_TEST_DB" // "1" = a missing database is a failure, not a skip
)

// The set-up runs once per test package (a package's tests share one process).
var (
	once sync.Once
	pool *pgxpool.Pool
	err  error

	migratedOnce sync.Once
	migratedPool *pgxpool.Pool
	migratedErr  error
)

// Pool returns a connection pool to the migrated and seeded test database.
// When TEST_DATABASE_URL is empty it skips the test - or fails it if REQUIRE_TEST_DB=1.
func Pool(t testing.TB) *pgxpool.Pool {
	t.Helper()
	url := testURL(t)
	once.Do(func() { pool, err = setup(url) })
	if err != nil {
		t.Fatalf("test database set-up failed: %v", err)
	}
	return pool
}

// Migrated returns a pool to the test database with every migration applied,
// WITHOUT touching the catalog (no reset, no seed). For tests that only need
// the schema, e.g. the auth tests: they create their own users with unique emails.
// Same skip / REQUIRE_TEST_DB rules as Pool.
func Migrated(t testing.TB) *pgxpool.Pool {
	t.Helper()
	url := testURL(t)
	migratedOnce.Do(func() { migratedPool, migratedErr = setupMigrated(url) })
	if migratedErr != nil {
		t.Fatalf("test database set-up failed: %v", migratedErr)
	}
	return migratedPool
}

// testURL reads TEST_DATABASE_URL: it skips (or fails) when it is empty and
// refuses a Neon host.
func testURL(t testing.TB) string {
	t.Helper()
	url := os.Getenv(envName)
	if url == "" {
		missingURL(t, os.Getenv(requireName))
		return "" // unreachable: Skip/Fatal stop the test (the line only satisfies the compiler)
	}
	// Safety net: the seed wipes the catalog tables, so refuse a Neon host.
	if strings.Contains(url, "neon.tech") {
		t.Fatal(envName + " points at Neon. Use a throw-away local/CI Postgres, never a Neon branch")
	}
	return url
}

// missingURL is the "no database" decision: skip locally, fail where a
// database is required (CI job `migrations`). Split out so it can be unit-tested.
func missingURL(t testing.TB, require string) {
	t.Helper()
	if require == "1" {
		t.Fatal(envName + " is empty but " + requireName + "=1: the database tests must run here, not be skipped")
		return
	}
	t.Skip(envName + " is empty: skipping database integration test")
}

// migrate applies every migration. The SQL files are embedded in the binary
// (migrations.FS). Up is idempotent: on a database that is already migrated it
// does nothing. Go tests several packages at the same time, each in its own
// process, so goose takes a Postgres advisory lock (session locker): only one
// process migrates, the others wait and then find nothing left to do.
func migrate(ctx context.Context, url string) error {
	sqlDB, err := sql.Open("pgx", url)
	if err != nil {
		return fmt.Errorf("open database/sql handle: %w", err)
	}
	defer sqlDB.Close()
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return fmt.Errorf("create migration lock: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations.FS, goose.WithSessionLocker(locker))
	if err != nil {
		return fmt.Errorf("create migration provider: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}

// setupMigrated applies every migration and opens a pool (no seed).
func setupMigrated(url string) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := migrate(ctx, url); err != nil {
		return nil, err
	}
	p, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	return p, nil
}

// setup applies every migration, then resets and seeds the catalog.
func setup(url string) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// 1. Migrations.
	if err := migrate(ctx, url); err != nil {
		return nil, err
	}

	// 2. Seed: the same deterministic generator as cmd/seed, in one transaction.
	snap, err := igdb.ParseSnapshot(seed.SnapshotJSON)
	if err != nil {
		return nil, err
	}
	extra, err := seedgen.ParseExtraAliases(seed.ExtraAliasesJSON)
	if err != nil {
		return nil, err
	}
	cat, err := seedgen.Generate(snap, extra)
	if err != nil {
		return nil, err
	}

	p, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	tx, err := p.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(context.Background()) // no-op after a successful Commit
	if err := seedgen.Lock(ctx, tx); err != nil {
		return nil, fmt.Errorf("lock catalog: %w", err)
	}
	// Orders from an earlier test run (pkg/orders) reference offers and keys; seedgen.Reset refuses
	// to run over orders on purpose (a real seed must never delete order history). This is the
	// throw-away test database, so here they are wiped first: payments, keys, then the orders
	// (their items go with them).
	for _, stmt := range []string{"DELETE FROM payments", "DELETE FROM keys", "DELETE FROM orders"} {
		if _, err := tx.Exec(ctx, stmt); err != nil {
			return nil, fmt.Errorf("wipe commerce tables (%s): %w", stmt, err)
		}
	}
	if err := seedgen.Reset(ctx, tx); err != nil {
		return nil, err
	}
	if err := seedgen.Insert(ctx, tx, cat); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit seed: %w", err)
	}
	return p, nil
}
