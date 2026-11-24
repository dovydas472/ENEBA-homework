// Command seed fills the catalog tables from the committed IGDB snapshot.
//
//	go run ./cmd/seed            # only into an EMPTY catalog (refuses otherwise)
//	go run ./cmd/seed --reset    # delete the catalog first, then seed
//	go run ./cmd/seed --aliases-only  # fill ONLY an empty game_aliases table (catalog with orders, Task 18)
//
// Run it from the repo root. Like cmd/migrate it reads DATABASE_URL_DIRECT (Neon
// DIRECT connection, no "-pooler"): locally from .env (Neon `dev` branch), in
// GitHub Actions from a secret (production - only via seed-production.yml).
//
// Everything happens in ONE transaction: either the whole catalog is written,
// or nothing changes. The data is deterministic (fixed RNG seed), so dev and
// production get exactly the same catalog; the printed checksum proves it.
//
// SECURITY: never prints the connection string, host, user or password.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"

	"github.com/dovydas472/ENEBA-homework/pkg/dbsafe"
	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
	"github.com/dovydas472/ENEBA-homework/pkg/seedgen"
	"github.com/dovydas472/ENEBA-homework/seed"
)

const (
	envName    = "DATABASE_URL_DIRECT"
	runTimeout = 2 * time.Minute
)

func main() {
	// godotenv is allowed only in cmd/* tools. Variables already present in the
	// environment win over .env, so CI (no .env file) just uses its secret.
	_ = godotenv.Load(".env")

	reset := flag.Bool("reset", false, "delete the existing catalog data before seeding")
	aliasesOnly := flag.Bool("aliases-only", false, "fill only the empty search-alias table; the rest of the catalog is not touched")
	flag.Parse()

	if *reset && *aliasesOnly {
		fmt.Fprintln(os.Stderr, "error: --reset and --aliases-only cannot be used together")
		os.Exit(2)
	}
	if err := run(*reset, *aliasesOnly); err != nil {
		fmt.Fprintln(os.Stderr, "error:", dbsafe.SafeMessage(err, os.Getenv(envName)))
		os.Exit(1)
	}
}

func run(reset, aliasesOnly bool) error {
	// 1. Build and check the data first - no database needed for this part.
	snap, err := igdb.ParseSnapshot(seed.SnapshotJSON)
	if err != nil {
		return err
	}
	extra, err := seedgen.ParseExtraAliases(seed.ExtraAliasesJSON)
	if err != nil {
		return err
	}
	catalog, err := seedgen.Generate(snap, extra)
	if err != nil {
		return err
	}
	stats, err := seedgen.Validate(catalog)
	if err != nil {
		return fmt.Errorf("generated catalog is invalid: %w", err)
	}
	fmt.Printf("snapshot: %d games (IGDB, fetched %s)\n", len(snap.Games), snap.Header.FetchedAt)

	// 2. Connect (DIRECT connection only).
	url := os.Getenv(envName)
	if err := dbsafe.CheckDirectURL(envName, url); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout)
	defer cancel()

	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		return errors.New(envName + " could not be parsed") // the parse error would echo the URL
	}
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return errors.New("cannot connect to the database (details hidden on purpose; check " + envName + ")")
	}
	defer conn.Close(context.Background())

	// 3. One transaction for everything. If any step fails, the deferred Rollback
	// undoes all of it; after a successful Commit, Rollback does nothing.
	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(context.Background())

	if err := seedgen.Lock(ctx, tx); err != nil {
		return fmt.Errorf("lock catalog tables (did the migrations run?): %w", err)
	}
	if aliasesOnly {
		return seedAliasesOnly(ctx, tx, catalog)
	}
	before, err := seedgen.Counts(ctx, tx)
	if err != nil {
		return err
	}
	if total(before) > 0 && !reset {
		return fmt.Errorf("the catalog already contains data (%s). Nothing was changed. "+
			"Run with --reset to delete it and seed again", format(before))
	}
	if total(before) > 0 {
		fmt.Printf("--reset: deleting existing catalog (%s)\n", format(before))
	}
	// Also on an empty catalog: restarts the ids at 1, so the result is identical
	// even if the tables were emptied by hand before.
	if err := seedgen.Reset(ctx, tx); err != nil {
		return err
	}
	if err := seedgen.Insert(ctx, tx, catalog); err != nil {
		return err
	}

	after, err := seedgen.Counts(ctx, tx)
	if err != nil {
		return err
	}
	sum, err := seedgen.Checksum(ctx, tx)
	if err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	fmt.Println("seeded (committed):")
	for i := len(after) - 1; i >= 0; i-- { // parents first, easier to read
		fmt.Printf("  %-12s %6d\n", after[i].Table, after[i].Rows)
	}
	fmt.Printf("  out-of-stock products: %d, offers without keys: %d, inactive offers: %d\n",
		stats.OutOfStockProducts, stats.ZeroKeyOffers, stats.InactiveOffers)
	fmt.Printf("  keys: %d available, %d reserved (expired), %d sold; new sellers: %d\n",
		stats.AvailableKeys, stats.ExpiredReservedKeys, stats.SoldKeys, stats.NewSellers)
	fmt.Printf("  search aliases: %d (IGDB + %d hand-written)\n", stats.Aliases, len(extra))
	fmt.Println("catalog checksum:", sum)
	return nil
}

// seedAliasesOnly adds the search aliases to a catalog that has everything else (Task 18: production
// missed them, and --reset refuses while orders exist). Same transaction and lock as a full seed.
// No catalog checksum is printed: on a database with sales the key rows differ from a fresh seed.
func seedAliasesOnly(ctx context.Context, tx pgx.Tx, catalog seedgen.Catalog) error {
	n, err := seedgen.InsertAliases(ctx, tx, catalog)
	if err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	fmt.Printf("--aliases-only: search aliases inserted (committed): %d\n", n)
	return nil
}

func total(counts []seedgen.TableCount) int64 {
	var n int64
	for _, c := range counts {
		n += c.Rows
	}
	return n
}

func format(counts []seedgen.TableCount) string {
	parts := make([]string, 0, len(counts))
	for _, c := range counts {
		parts = append(parts, fmt.Sprintf("%s=%d", c.Table, c.Rows))
	}
	return strings.Join(parts, ", ")
}
