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
const goldenHash = "aee39427e9f69766ebbd1af4f4f469dd423e1ee77fd6ed31868a184a65c3f754"

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
