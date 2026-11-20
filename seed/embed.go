// Package seed holds the committed IGDB snapshot and embeds it into the Go binary.
//
// Why go:embed and not os.ReadFile: the file is compiled into cmd/seed, so the
// tool works from any working directory, in CI the file cannot be "missing" or
// read from a wrong path, and the data that is seeded is exactly the data of the
// commit that was built. Same pattern as migrations/embed.go.
package seed

import _ "embed"

// SnapshotJSON is seed/igdb_snapshot.json (written by cmd/igdb-snapshot).
//
//go:embed igdb_snapshot.json
var SnapshotJSON []byte
