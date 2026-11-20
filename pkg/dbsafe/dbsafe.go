// Package dbsafe holds the safety rules shared by the command-line tools that use
// the Neon DIRECT connection (cmd/migrate, cmd/seed):
//
//   - CheckDirectURL refuses the POOLED connection string (host contains "-pooler").
//   - SafeMessage removes the connection string, host, user, password and IP
//     addresses from an error before it is printed.
//
// Both tools also run in GitHub Actions, whose logs are public for a public repo,
// so nothing they print may reveal where the database is or how to log in.
package dbsafe

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

// CheckDirectURL is the safety guard: these tools must use the Neon DIRECT
// connection. The pooled host (contains "-pooler") goes through PgBouncer in
// transaction mode, which has no session state - but goose's advisory lock and
// the seed's long transaction need ONE real session for the whole run.
//
// envName is only used in the messages. The messages never contain any part of the URL.
func CheckDirectURL(envName, raw string) error {
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
		return errors.New(envName + " points to the POOLED connection (host contains \"-pooler\"); this tool needs the DIRECT connection")
	}
	return nil
}

var ipv4 = regexp.MustCompile(`\b\d{1,3}(?:\.\d{1,3}){3}\b`)

// SafeMessage returns err's text with everything sensitive removed. It is a second
// line of defence: our own errors are already generic, but goose or the driver
// could echo the host, user, password or an IP address of the server.
func SafeMessage(err error, rawURL string) string {
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
