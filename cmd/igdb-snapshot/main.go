// Command igdb-snapshot downloads ~50 well-known games from IGDB ONCE and writes
// them to seed/igdb_snapshot.json, which is committed to the repo.
//
//	go run ./cmd/igdb-snapshot
//
// It runs ONLY on the owner's PC: it reads IGDB_CLIENT_ID and IGDB_CLIENT_SECRET
// from the local .env. These credentials are never committed, never set on
// Vercel or GitHub, and this tool never prints them or the access token.
// Everything else (cmd/seed, the app) reads only the committed JSON file.
//
// Requests: 1 to Twitch (token) + 1 to IGDB (games) - far below the 4 req/s limit.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"

	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
)

const outFile = "seed/igdb_snapshot.json" // relative to the repo root

func main() {
	// godotenv is allowed only in cmd/* tools. A missing .env is not an error here;
	// the check below reports the missing variables clearly.
	_ = godotenv.Load(".env")

	clientID := os.Getenv("IGDB_CLIENT_ID")
	secret := os.Getenv("IGDB_CLIENT_SECRET")
	if err := run(clientID, secret); err != nil {
		fmt.Fprintln(os.Stderr, "error:", scrub(err.Error(), clientID, secret))
		os.Exit(1)
	}
}

func run(clientID, secret string) error {
	var missing []string
	if strings.TrimSpace(clientID) == "" {
		missing = append(missing, "IGDB_CLIENT_ID")
	}
	if strings.TrimSpace(secret) == "" {
		missing = append(missing, "IGDB_CLIENT_SECRET")
	}
	if len(missing) > 0 {
		return fmt.Errorf("%s not set: add them to your local .env (Twitch developer console -> your app). "+
			"Never put them anywhere else", strings.Join(missing, " and "))
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	client := igdb.NewClient(clientID)
	if err := client.Authenticate(ctx, secret); err != nil {
		return err
	}
	fmt.Println("token received (not shown)")

	var raw []igdb.APIGame
	if err := client.Query(ctx, "games", igdb.GamesQuery, &raw); err != nil {
		return err
	}
	fmt.Printf("IGDB returned %d candidates\n", len(raw))

	games := igdb.Select(raw, igdb.SnapshotSize)
	if len(games) < igdb.SnapshotSize {
		return fmt.Errorf("only %d games passed the filters, need %d: raise the limit in igdb.GamesQuery", len(games), igdb.SnapshotSize)
	}

	snap := igdb.Snapshot{
		Header: igdb.Header{
			Source:      igdb.SnapshotSource,
			Attribution: igdb.SnapshotAttribution,
			FetchedAt:   time.Now().UTC().Format(time.RFC3339),
			Endpoint:    "POST https://api.igdb.com/v4/games",
			Query:       igdb.GamesQuery,
			Filters:     igdb.SelectFilters,
		},
		Games: games,
	}
	if err := write(snap); err != nil {
		return err
	}

	fmt.Printf("wrote %s: %d games\n", outFile, len(games))
	for i, g := range games[:10] {
		fmt.Printf("%2d. %-45s popularity %d\n", i+1, g.Name, g.TotalRatingCount)
	}
	return nil
}

// write saves the snapshot pretty-printed (2-space indent, trailing newline), so
// a re-run produces a readable git diff. SetEscapeHTML(false) keeps "&" and "<"
// readable in titles and summaries.
func write(s igdb.Snapshot) error {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(s); err != nil {
		return errors.New("cannot encode the snapshot")
	}
	if err := os.MkdirAll(filepath.Dir(outFile), 0o755); err != nil {
		return fmt.Errorf("cannot create %s (run from the repo root)", filepath.Dir(outFile))
	}
	if err := os.WriteFile(outFile, buf.Bytes(), 0o644); err != nil {
		return fmt.Errorf("cannot write %s", outFile)
	}
	return nil
}

// scrub removes the credentials from a message - a last safety net; our own
// errors never contain them.
func scrub(msg string, secrets ...string) string {
	for _, s := range secrets {
		if len(s) >= 4 {
			msg = strings.ReplaceAll(msg, s, "[REDACTED]")
		}
	}
	return msg
}
