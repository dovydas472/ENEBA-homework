// Helpers for the `create` sub-command. The connection-string guard and the error
// scrubber are shared with cmd/seed and live in pkg/dbsafe.
package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
)

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
