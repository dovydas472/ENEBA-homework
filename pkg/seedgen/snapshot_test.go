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
//
// History: Task 13a changed it on purpose (search aliases added to Game; the rest
// of the catalog is proven unchanged by TestAliasesDoNotChangeTheRestOfTheCatalog).
const goldenHash = "13c04c516f803ece6120a4e389eb81806f1ea62b6187fd22792ac272e1b91359"

func realCatalog(t *testing.T) Catalog {
	t.Helper()
	snap, err := igdb.ParseSnapshot(seed.SnapshotJSON)
	if err != nil {
		t.Fatal(err)
	}
	extra, err := ParseExtraAliases(seed.ExtraAliasesJSON)
	if err != nil {
		t.Fatal(err)
	}
	c, err := Generate(snap, extra)
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
