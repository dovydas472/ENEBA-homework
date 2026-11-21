// Package testdb gives database integration tests a ready-to-use Postgres:
// migrated and filled with the deterministic demo catalog (pkg/seedgen).
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
)

// Pool returns a connection pool to the migrated and seeded test database.
// When TEST_DATABASE_URL is empty it skips the test - or fails it if REQUIRE_TEST_DB=1.
func Pool(t testing.TB) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv(envName)
	if url == "" {
		missingURL(t, os.Getenv(requireName))
		return nil // unreachable: Skip/Fatal stop the test (the line only satisfies the compiler)
	}
	// Safety net: the seed wipes the catalog tables, so refuse a Neon host.
	if strings.Contains(url, "neon.tech") {
		t.Fatal(envName + " points at Neon. Use a throw-away local/CI Postgres, never a Neon branch")
	}

	once.Do(func() { pool, err = setup(url) })
	if err != nil {
		t.Fatalf("test database set-up failed: %v", err)
	}
	return pool
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

// setup applies every migration, then resets and seeds the catalog.
func setup(url string) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// 1. Migrations: the SQL files are embedded in the binary (migrations.FS).
	// Up is idempotent: on a database that is already migrated it does nothing.
	sqlDB, err := sql.Open("pgx", url)
	if err != nil {
		return nil, fmt.Errorf("open database/sql handle: %w", err)
	}
	defer sqlDB.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations.FS)
	if err != nil {
		return nil, fmt.Errorf("create migration provider: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return nil, fmt.Errorf("apply migrations: %w", err)
	}

	// 2. Seed: the same deterministic generator as cmd/seed, in one transaction.
	snap, err := igdb.ParseSnapshot(seed.SnapshotJSON)
	if err != nil {
		return nil, err
	}
	cat, err := seedgen.Generate(snap)
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
