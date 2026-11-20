package main

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// checkDirectURL is the safety guard: migrations must use the Neon DIRECT
// connection. The pooled host (contains "-pooler") goes through PgBouncer in
// transaction mode, which has no session state - but the advisory lock needs ONE
// session that lives for the whole migration run.
//
// The error messages never contain any part of the URL.
func checkDirectURL(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return errors.New(envName + " is empty or not set (locally: add it to .env; in CI: set the GitHub secret)")
	}
	// Only the URL form is accepted, so the host can be inspected reliably.
	if !strings.HasPrefix(raw, "postgres://") && !strings.HasPrefix(raw, "postgresql://") {
		return errors.New(envName + " must be a postgres:// URL")
	}
	u, err := url.Parse(raw)
	if err != nil {
		// Do not wrap err: url.Parse errors echo the whole URL.
		return errors.New(envName + " is not a valid URL")
	}
	if u.Hostname() == "" {
		return errors.New(envName + " has no host")
	}
	if strings.Contains(strings.ToLower(u.Hostname()), "-pooler") {
		return errors.New(envName + " points to the POOLED connection (host contains \"-pooler\"); migrations need the DIRECT connection")
	}
	return nil
}

var ipv4 = regexp.MustCompile(`\b\d{1,3}(?:\.\d{1,3}){3}\b`)

// safeMessage returns err's text with everything sensitive removed. It is a second
// line of defence: our own errors are already generic, but goose or the driver
// could echo the host, user, password or an IP address of the server.
func safeMessage(err error, rawURL string) string {
	msg := err.Error()
	secrets := []string{rawURL}
	if u, perr := url.Parse(rawURL); perr == nil {
		secrets = append(secrets, u.Host, u.Hostname(), u.User.Username())
		if pw, ok := u.User.Password(); ok {
			secrets = append(secrets, pw)
		}
	}
	for _, s := range secrets {
		if len(s) >= 3 { // ignore empty / tiny values: replacing them would mangle the text
			msg = strings.ReplaceAll(msg, s, "[REDACTED]")
		}
	}
	return ipv4.ReplaceAllString(msg, "[REDACTED]")
}

var (
	validName     = regexp.MustCompile(`^[a-z0-9]+(_[a-z0-9]+)*$`)
	migrationFile = regexp.MustCompile(`^(\d+)_.+\.sql$`)
)

const migrationTemplate = `-- +goose Up


-- +goose Down

`

// createMigration writes the next sequentially numbered migration file
// (00002_name.sql, ...) into dir and returns its path. It needs no database.
func createMigration(dir, name string) (string, error) {
	if !validName.MatchString(name) {
		return "", errors.New("migration name must be snake_case: lowercase letters, digits and single underscores (e.g. add_games_table)")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", fmt.Errorf("cannot read the %q folder (run this from the repo root)", dir)
	}
	last := 0
	for _, e := range entries {
		if m := migrationFile.FindStringSubmatch(e.Name()); m != nil {
			if n, _ := strconv.Atoi(m[1]); n > last {
				last = n
			}
		}
	}
	path := filepath.Join(dir, fmt.Sprintf("%05d_%s.sql", last+1, name))
	// O_EXCL: never overwrite an existing file.
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", fmt.Errorf("cannot create %s", path)
	}
	defer f.Close()
	if _, err := f.WriteString(migrationTemplate); err != nil {
		return "", fmt.Errorf("cannot write %s", path)
	}
	return path, nil
}
