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
// aliases - must use their GIN trigram index. A 3+ character query uses it for
// ILIKE and <%; a 2-character query (Task 13c) for the word-start regex ~*.
func TestSearchMatchCanUseTheTrigramIndexes(t *testing.T) {
	tests := []struct {
		q    string
		want string // the condition that must be an index condition (shown commuted: <% as %>)
	}{
		{"witchr 3", "%> 'witchr 3'"},
		{"re", "~* '(^|[^[:alnum:]])re'"},
	}
	for _, tc := range tests {
		t.Run(tc.q, func(t *testing.T) {
			plan := explainSearch(t, tc.q)
			for _, want := range []string{
				"Bitmap Index Scan on games_title_trgm_idx",
				"Bitmap Index Scan on game_aliases_alias_trgm_idx",
				tc.want,
			} {
				if !strings.Contains(plan, want) {
					t.Errorf("plan does not contain %q:\n%s", want, plan)
				}
			}
		})
	}
}

// explainSearch returns the plan of the match step for q, as the planner would
// choose it on a big catalog (seq scans off, for this transaction only).
func explainSearch(t *testing.T, q string) string {
	t.Helper()
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
	rows, err := tx.Query(ctx, "EXPLAIN (COSTS OFF) WITH "+searchCTEs+" SELECT * FROM game_matches", searchArgs(q))
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
	return plan.String()
}
