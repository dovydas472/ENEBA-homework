// Command migrate applies database migrations with goose.
//
//	go run ./cmd/migrate up | down | status | version | create <name>
//
// Run it from the repo root. It reads DATABASE_URL_DIRECT (Neon DIRECT connection,
// host WITHOUT "-pooler"). Locally the value comes from .env (Neon `dev` branch);
// in GitHub Actions it comes from a secret. Production is migrated only by CI.
//
// SECURITY: this tool never prints the connection string, host, user or password -
// GitHub Actions logs of a public repo are public. See pkg/dbsafe.
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"

	// Registers the "pgx" driver name for database/sql.
	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/dovydas472/ENEBA-homework/migrations"
	"github.com/dovydas472/ENEBA-homework/pkg/dbsafe"
)

const (
	envName     = "DATABASE_URL_DIRECT"
	runTimeout  = 2 * time.Minute
	usage       = "usage: go run ./cmd/migrate up | down | status | version | create <name>"
	migrationsD = "migrations" // folder used by `create` (relative to the repo root)
)

func main() {
	// godotenv is allowed only in cmd/* tools. Variables already present in the
	// environment win over .env, so CI (no .env file) just uses its secret.
	// A missing .env is normal and is not reported.
	_ = godotenv.Load(".env")

	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", dbsafe.SafeMessage(err, os.Getenv(envName)))
		os.Exit(1)
	}
}

// run dispatches the sub-command. It returns an error instead of exiting so that
// main has ONE place that prints errors (and scrubs them).
func run(args []string) error {
	if len(args) == 0 {
		return errors.New(usage)
	}
	cmd := args[0]

	// `create` only writes a file: no database, no env variable needed.
	if cmd == "create" {
		if len(args) != 2 {
			return errors.New("usage: go run ./cmd/migrate create <name>")
		}
		path, err := createMigration(migrationsD, args[1])
		if err != nil {
			return err
		}
		fmt.Println("created", path)
		return nil
	}

	switch cmd {
	case "up", "down", "status", "version":
	default:
		return fmt.Errorf("unknown command %q\n%s", cmd, usage)
	}

	url := os.Getenv(envName)
	if err := dbsafe.CheckDirectURL(envName, url); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), runTimeout)
	defer cancel()

	provider, closeDB, err := newProvider(ctx, url)
	if err != nil {
		return err
	}
	defer closeDB()

	switch cmd {
	case "up":
		return doUp(ctx, provider)
	case "down":
		return doDown(ctx, provider)
	case "status":
		return doStatus(ctx, provider)
	default: // "version"
		v, err := provider.GetDBVersion(ctx)
		if err != nil {
			return err
		}
		fmt.Println("current version:", v)
		return nil
	}
}

// newProvider opens the database and builds a goose Provider.
//
//   - migrations.FS: the SQL files compiled into the binary (go:embed).
//   - WithSessionLocker: goose takes a Postgres advisory lock on a dedicated session
//     before migrating, so two parallel runs (e.g. two CI jobs) can never apply
//     migrations at the same time - the second one waits.
func newProvider(ctx context.Context, url string) (*goose.Provider, func(), error) {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, nil, errors.New("cannot open the database handle")
	}
	closeDB := func() { _ = db.Close() }

	// Fail early with a clear, generic message (a raw driver error would contain
	// the host and user name).
	if err := db.PingContext(ctx); err != nil {
		closeDB()
		return nil, nil, errors.New("cannot connect to the database (details hidden on purpose; check " + envName + ")")
	}

	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		closeDB()
		return nil, nil, fmt.Errorf("cannot create the session locker: %w", err)
	}
	provider, err := goose.NewProvider(
		goose.DialectPostgres,
		db,
		migrations.FS,
		goose.WithSessionLocker(locker),
	)
	if err != nil {
		closeDB()
		return nil, nil, fmt.Errorf("cannot create the migration provider: %w", err)
	}
	return provider, closeDB, nil
}

func doUp(ctx context.Context, p *goose.Provider) error {
	results, err := p.Up(ctx)
	for _, r := range results {
		fmt.Printf("applied  %s (%s)\n", r.Source.Path, r.Duration.Round(time.Millisecond))
	}
	if err != nil {
		return err
	}
	if len(results) == 0 {
		fmt.Println("nothing to apply: database is up to date")
	}
	return nil
}

// doDown rolls back exactly ONE migration (the most recently applied one).
func doDown(ctx context.Context, p *goose.Provider) error {
	r, err := p.Down(ctx)
	if errors.Is(err, goose.ErrNoNextVersion) {
		fmt.Println("nothing to roll back")
		return nil
	}
	if err != nil {
		return err
	}
	fmt.Printf("rolled back  %s (%s)\n", r.Source.Path, r.Duration.Round(time.Millisecond))
	return nil
}

func doStatus(ctx context.Context, p *goose.Provider) error {
	statuses, err := p.Status(ctx)
	if err != nil {
		return err
	}
	for _, s := range statuses {
		state := "pending"
		if s.State == goose.StateApplied {
			state = "applied " + s.AppliedAt.UTC().Format("2006-01-02 15:04:05 UTC")
		}
		fmt.Printf("%-40s %s\n", s.Source.Path, state)
	}
	return nil
}
