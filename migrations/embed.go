// Package migrations holds the SQL migration files and embeds them into the Go binary,
// so `go run ./cmd/migrate` needs no files on disk and CI cannot "forget" a file.
package migrations

import "embed"

// FS contains every *.sql file in this folder (read by goose through its Provider API).
//
//go:embed *.sql
var FS embed.FS
