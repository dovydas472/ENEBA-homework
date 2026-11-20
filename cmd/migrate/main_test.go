package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCheckDirectURL and TestSafeMessageHidesSecrets moved to pkg/dbsafe with the code.

func TestCreateMigration(t *testing.T) {
	dir := t.TempDir()
	for _, f := range []string{"00001_extensions.sql", "embed.go"} {
		if err := os.WriteFile(filepath.Join(dir, f), nil, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	path, err := createMigration(dir, "add_games")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(path) != "00002_add_games.sql" {
		t.Fatalf("unexpected file name %s", path)
	}
	body, _ := os.ReadFile(path)
	if !strings.Contains(string(body), "-- +goose Up") || !strings.Contains(string(body), "-- +goose Down") {
		t.Fatalf("template is missing goose annotations: %q", body)
	}
	if _, err := createMigration(dir, "Bad Name"); err == nil {
		t.Fatal("expected an error for an invalid name")
	}
}
