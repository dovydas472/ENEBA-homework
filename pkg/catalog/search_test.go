package catalog

import (
	"strings"
	"testing"
)

func TestNormalizeQuery(t *testing.T) {
	for in, want := range map[string]string{
		"witcher":           "witcher",
		"  witchr   3 ":     "witchr 3",
		"\tgta\n5":          "gta 5",
		"   ":               "",
		"Grand Theft Auto ": "Grand Theft Auto", // case is kept: matching is case-insensitive anyway
	} {
		if got := NormalizeQuery(in); got != want {
			t.Errorf("NormalizeQuery(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSearchArgsEscapeLikeWildcards(t *testing.T) {
	args := searchArgs(`100%_a\b`)
	if args["q"] != `100%_a\b` {
		t.Errorf("q must be passed unchanged (it is not a LIKE pattern), got %v", args["q"])
	}
	if want := `100\%\_a\\b%`; args["q_prefix"] != want {
		t.Errorf("q_prefix = %v, want %v", args["q_prefix"], want)
	}
	if want := `%100\%\_a\\b%`; args["q_contains"] != want {
		t.Errorf("q_contains = %v, want %v", args["q_contains"], want)
	}
}

func TestSearchArgsWithoutQueryAreNull(t *testing.T) {
	for _, k := range []string{"q", "q_prefix", "q_contains", "q_word_start", "short_query"} {
		if v, ok := searchArgs("")[k]; !ok || v != nil {
			t.Errorf("%s = %v (present %v), want an explicit nil (SQL NULL = no search)", k, v, ok)
		}
	}
}

// Every Sort has exactly one ORDER BY line, and none contains the placeholder.
func TestOrderByCoversEverySort(t *testing.T) {
	for _, s := range Sorts {
		o, ok := orderBy[s]
		if !ok || strings.Contains(o, orderPlaceholder) {
			t.Errorf("sort %q: bad ORDER BY %q", s, o)
		}
	}
	if !strings.Contains(itemsSQL, orderPlaceholder) {
		t.Error("itemsSQL lost its ORDER BY placeholder")
	}
}

// 2-character queries (after normalising) use the word-start rule; 3+ keep contains/similar.
func TestSearchArgsShortQueryUsesWordStart(t *testing.T) {
	for _, tc := range []struct {
		q     string
		short bool
	}{
		{"re", true},
		{"ü?", true}, // counted in characters, not bytes
		{"gta", false},
		{"re d", false},
	} {
		args := searchArgs(tc.q)
		if args["short_query"] != tc.short {
			t.Errorf("searchArgs(%q): short_query = %v, want %v", tc.q, args["short_query"], tc.short)
		}
		if tc.short && args["q_word_start"] == nil {
			t.Errorf("searchArgs(%q): q_word_start must be set for a short query", tc.q)
		}
		if !tc.short && args["q_word_start"] != nil {
			t.Errorf("searchArgs(%q): q_word_start = %v, want nil for a 3+ character query", tc.q, args["q_word_start"])
		}
	}
}

// The word-start pattern is a regex: the characters of the user's text must lose their special meaning.
func TestWordStartPatternEscapesRegexCharacters(t *testing.T) {
	if got, want := searchArgs(".*")["q_word_start"], `(^|[^[:alnum:]])\.\*`; got != want {
		t.Errorf("q_word_start for %q = %v, want %v", ".*", got, want)
	}
	if got, want := searchArgs("re")["q_word_start"], `(^|[^[:alnum:]])re`; got != want {
		t.Errorf("q_word_start for %q = %v, want %v", "re", got, want)
	}
}
