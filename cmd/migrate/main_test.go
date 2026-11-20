package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// No database is used: only fake URLs.
func TestCheckDirectURL(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"direct host accepted", "postgres://user:pw@ep-cool-name-123456.eu-central-1.aws.neon.tech/db?sslmode=require", false},
		{"postgresql scheme accepted", "postgresql://user:pw@db.example.com/db", false},
		{"pooled host rejected", "postgres://user:pw@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/db", true},
		{"pooled host in upper case rejected", "postgres://user:pw@EP-COOL-123456-POOLER.example.com/db", true},
		{"empty rejected", "", true},
		{"spaces only rejected", "   ", true},
		{"not a postgres url rejected", "mysql://user:pw@host/db", true},
		{"key/value dsn rejected", "host=ep-x-pooler.example.com user=u", true},
		{"missing host rejected", "postgres:///db", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := checkDirectURL(tc.url)
			if (err != nil) != tc.wantErr {
				t.Fatalf("checkDirectURL() error = %v, wantErr %v", err, tc.wantErr)
			}
			// The message must never reveal the URL, host or password.
			if err != nil && (strings.Contains(err.Error(), "pw@") || strings.Contains(err.Error(), "example.com") || strings.Contains(err.Error(), "neon.tech")) {
				t.Fatalf("error leaks part of the URL: %v", err)
			}
		})
	}
}

func TestSafeMessageHidesSecrets(t *testing.T) {
	const raw = "postgres://alice:hunter2@ep-secret-host-999.example.com:5432/shop"
	err := errors.New("failed to connect to `host=ep-secret-host-999.example.com user=alice`: dial tcp 10.1.2.3:5432: password hunter2 bad")
	got := safeMessage(err, raw)
	for _, leak := range []string{"ep-secret-host-999", "alice", "hunter2", "10.1.2.3"} {
		if strings.Contains(got, leak) {
			t.Fatalf("message still contains %q: %s", leak, got)
		}
	}
}

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
