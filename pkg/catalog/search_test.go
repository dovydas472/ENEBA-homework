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
	for _, k := range []string{"q", "q_prefix", "q_contains"} {
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
