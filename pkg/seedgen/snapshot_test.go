package seedgen

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
	"github.com/dovydas472/ENEBA-homework/seed"
)

// goldenHash is the SHA-256 of the catalog generated from the committed snapshot.
// If it changes, the seeded data changes: either the snapshot or a rule was changed
// on purpose (then update this value), or something broke determinism (for example
// a different random number sequence) - which this test exists to catch.
const goldenHash = "c2a7beea4dbe41b1388c33cee11cec647116c0bd9e0b248da5a4e7d0942c8437"

func realCatalog(t *testing.T) Catalog {
	t.Helper()
	snap, err := igdb.ParseSnapshot(seed.SnapshotJSON)
	if err != nil {
		t.Fatal(err)
	}
	c, err := Generate(snap)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestRealSnapshotIsValid(t *testing.T) {
	st, err := Validate(realCatalog(t))
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("%+v", st)
}

func TestRealSnapshotGolden(t *testing.T) {
	b, err := json.Marshal(realCatalog(t))
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(b)
	if got := hex.EncodeToString(sum[:]); got != goldenHash {
		t.Fatalf("generated catalog changed: hash %s, want %s", got, goldenHash)
	}
}
