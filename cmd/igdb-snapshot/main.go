// Command igdb-snapshot downloads ~50 well-known games from IGDB ONCE and writes
// them to seed/igdb_snapshot.json, which is committed to the repo.
//
//	go run ./cmd/igdb-snapshot                 # full refresh: new game list + aliases
//	go run ./cmd/igdb-snapshot --aliases-only  # keep the 50 games, only (re)fetch their aliases
//
// --aliases-only reads the committed snapshot, asks IGDB for the alternative names
// of exactly those games and writes the file back. Every other field - the game
// list, popularity, covers, summaries, the header with fetched_at - stays byte for
// byte the same, so the catalog (and the seed built from it) does not change;
// `git diff` must show only "aliases" lines.
//
// It runs ONLY on the owner's PC: it reads IGDB_CLIENT_ID and IGDB_CLIENT_SECRET
// from the local .env. These credentials are never committed, never set on
// Vercel or GitHub, and this tool never prints them or the access token.
// Everything else (cmd/seed, the app) reads only the committed JSON file.
//
// Requests: 1 to Twitch (token) + 1 to IGDB (games) + 1 to IGDB (alternative names,
// one more per 500 names) - far below the 4 req/s limit.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
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

	aliasesOnly := flag.Bool("aliases-only", false,
		"keep the games of the committed snapshot and only fetch their aliases (IGDB alternative_names)")
	flag.Parse()

	clientID := os.Getenv("IGDB_CLIENT_ID")
	secret := os.Getenv("IGDB_CLIENT_SECRET")
	if err := run(clientID, secret, *aliasesOnly); err != nil {
		fmt.Fprintln(os.Stderr, "error:", scrub(err.Error(), clientID, secret))
		os.Exit(1)
	}
}

func run(clientID, secret string, aliasesOnly bool) error {
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

	if aliasesOnly {
		return refreshAliases(ctx, client)
	}

	var raw []igdb.APIGame
	if err := client.Query(ctx, "games", igdb.GamesQuery, &raw); err != nil {
		return err
	}
	fmt.Printf("IGDB returned %d candidates\n", len(raw))

	games := igdb.Select(raw, igdb.SnapshotSize)
	if len(games) < igdb.SnapshotSize {
		return fmt.Errorf("only %d games passed the filters, need %d: raise the limit in igdb.GamesQuery", len(games), igdb.SnapshotSize)
	}
	if err := addAliases(ctx, client, games); err != nil {
		return err
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

// refreshAliases is --aliases-only: committed snapshot in, the same snapshot with
// fresh aliases out. Only Game.Aliases is assigned; nothing else is touched.
func refreshAliases(ctx context.Context, client *igdb.Client) error {
	data, err := os.ReadFile(outFile)
	if err != nil {
		return fmt.Errorf("cannot read %s (run from the repo root)", outFile)
	}
	snap, err := igdb.ParseSnapshot(data)
	if err != nil {
		return err
	}
	if err := addAliases(ctx, client, snap.Games); err != nil {
		return err
	}
	if err := write(snap); err != nil {
		return err
	}
	fmt.Printf("wrote %s: aliases for %d games (nothing else changed - check with git diff)\n", outFile, len(snap.Games))
	return nil
}

// addAliases fetches the alternative names of the given games (500 per request,
// sorted by id) and stores the cleaned ones in games[i].Aliases.
func addAliases(ctx context.Context, client *igdb.Client, games []igdb.Game) error {
	ids := make([]int64, len(games))
	for i, g := range games {
		ids[i] = g.IGDBID
	}
	var all []igdb.APIAlternativeName
	for offset := 0; ; offset += igdb.AliasesPageSize {
		var page []igdb.APIAlternativeName
		if err := client.Query(ctx, "alternative_names", igdb.AliasesQuery(ids, offset), &page); err != nil {
			return err
		}
		all = append(all, page...)
		if len(page) < igdb.AliasesPageSize {
			break
		}
	}
	byGame := igdb.GroupAliases(all)
	kept := 0
	for i := range games {
		games[i].Aliases = igdb.CleanAliases(games[i].Name, byGame[games[i].IGDBID], igdb.MaxAliases)
		kept += len(games[i].Aliases)
	}
	fmt.Printf("IGDB returned %d alternative names, %d kept after cleaning\n", len(all), kept)
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
