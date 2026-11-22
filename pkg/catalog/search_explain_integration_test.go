package catalog

// Inside the package (not catalog_test) because it EXPLAINs the unexported
// searchCTEs. Skipped without TEST_DATABASE_URL, like the other integration tests.

import (
	"context"
	"strings"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/testdb"
)

// The match step can be answered from the trigram indexes. With 50 games and
// ~130 aliases (one disk page each) the planner rightly prefers a sequential
// scan, so the test switches seq scans off for ONE transaction (SET LOCAL) to
// see the plan it would pick on a bigger catalog: both halves - titles and
// aliases - must use their GIN trigram index for ILIKE and for <%.
func TestSearchMatchCanUseTheTrigramIndexes(t *testing.T) {
	ctx := context.Background()
	tx, err := testdb.Pool(t).Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx) // also undoes SET LOCAL

	if _, err := tx.Exec(ctx, "SET LOCAL enable_seqscan = off"); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, searchThresholdSQL); err != nil {
		t.Fatal(err)
	}
	rows, err := tx.Query(ctx, "EXPLAIN (COSTS OFF) WITH "+searchCTEs+" SELECT * FROM game_matches", searchArgs("witchr 3"))
	if err != nil {
		t.Fatal(err)
	}
	var plan strings.Builder
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			t.Fatal(err)
		}
		plan.WriteString(line + "\n")
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{
		"Bitmap Index Scan on games_title_trgm_idx",
		"Bitmap Index Scan on game_aliases_alias_trgm_idx",
		"%> 'witchr 3'", // the <% condition itself is an index condition (shown commuted as %>)
	} {
		if !strings.Contains(plan.String(), want) {
			t.Errorf("plan does not contain %q:\n%s", want, plan.String())
		}
	}
}
