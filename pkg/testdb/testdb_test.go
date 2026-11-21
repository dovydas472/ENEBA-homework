package testdb

import (
	"strings"
	"testing"
)

// recorder is a testing.TB that only records what the helper asked for.
// (Embedding testing.TB satisfies its private method; only Fatal/Skip/Helper are used.)
type recorder struct {
	testing.TB
	fatal, skip string
}

func (r *recorder) Helper()        {}
func (r *recorder) Fatal(a ...any) { r.fatal = strings.TrimSpace(joinArgs(a)) }
func (r *recorder) Skip(a ...any)  { r.skip = strings.TrimSpace(joinArgs(a)) }
func joinArgs(a []any) string {
	var b strings.Builder
	for _, x := range a {
		b.WriteString(x.(string))
	}
	return b.String()
}

func TestMissingURL(t *testing.T) {
	tests := []struct {
		name        string
		require     string
		wantFatal   bool
		wantSkipped bool
	}{
		{"local run: not required -> skip", "", false, true},
		{"explicitly off -> skip", "0", false, true},
		{"CI: required -> fail, never skip", "1", true, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			r := &recorder{}
			missingURL(r, tc.require)
			if (r.fatal != "") != tc.wantFatal || (r.skip != "") != tc.wantSkipped {
				t.Errorf("fatal=%q skip=%q, want fatal=%v skip=%v", r.fatal, r.skip, tc.wantFatal, tc.wantSkipped)
			}
			if tc.wantFatal && !strings.Contains(r.fatal, "REQUIRE_TEST_DB") {
				t.Errorf("the failure message should name REQUIRE_TEST_DB: %q", r.fatal)
			}
		})
	}
}
