package catalog_test

// Search integration tests (Task 13a) against the deterministic seed (pkg/testdb).
// Skipped without TEST_DATABASE_URL; CI runs them in the `migrations` job.
// The query table is the one the threshold was tuned with (report of Task 13a).

import (
	"context"
	"reflect"
	"sort"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
)

func suggest(t *testing.T, s *catalog.Store, q string) []catalog.Suggestion {
	t.Helper()
	got, err := s.Suggest(context.Background(), q)
	if err != nil {
		t.Fatalf("Suggest(%q): %v", q, err)
	}
	return got
}

func TestSearch_queryTable(t *testing.T) {
	s := newStore(t)
	tests := []struct {
		q, top string
		alias  string // expected matchedAlias of the top suggestion; "" = null
	}{
		{"witcher", "The Witcher 3: Wild Hunt", ""},
		{"witchr 3", "The Witcher 3: Wild Hunt", ""}, // typo: needs the 0.55 threshold (score 0.58)
		{"the witcher", "The Witcher 3: Wild Hunt", ""},
		{"gta", "Grand Theft Auto V", "GTA 5"},   // alias prefix, then popularity
		{"gta 5", "Grand Theft Auto V", "GTA 5"}, // exact alias
		{"GTA 5", "Grand Theft Auto V", "GTA 5"}, // case does not matter
		{"gta sa", "Grand Theft Auto: San Andreas", "GTA San Andreas"},
		{"elden", "Elden Ring", ""},
		{"eldn ring", "Elden Ring", ""},
		{"skyrm", "The Elder Scrolls V: Skyrim", ""},
		{"bioshok", "BioShock", ""},
		{"rdr2", "Red Dead Redemption 2", "RDR2"},
		{"portal", "Portal", ""},  // exact title beats the more popular Portal 2 (prefix)
		{"portl", "Portal 2", ""}, // typo: both Portals tie -> more popular first
		{"halflife", "Half-Life 2", ""},
		{"hl2", "Half-Life 2", "HL2"},
		{"hzd", "Horizon Zero Dawn", "HZD"}, // hand-written extra alias
		// 2 characters: word starts only (Task 13c)
		{"gt", "Grand Theft Auto V", "GTA 5"}, // start of the alias "GTA 5"
		{"ac", "Assassin's Creed", "AC"},      // the alias "AC"; the title has no word starting with "ac"
		{"re", "Red Dead Redemption 2", ""},   // start of the title
		{"li", "Life Is Strange", ""},         // title start (more popular than the two Half-Lifes, where "Life" follows a "-")
	}
	for _, tc := range tests {
		t.Run(tc.q, func(t *testing.T) {
			q := catalog.NormalizeQuery(tc.q)
			sg := suggest(t, s, q)
			if len(sg) == 0 {
				t.Fatalf("no suggestions, want %q first", tc.top)
			}
			if sg[0].GameTitle != tc.top {
				t.Errorf("top suggestion = %q, want %q", sg[0].GameTitle, tc.top)
			}
			gotAlias := ""
			if sg[0].MatchedAlias != nil {
				gotAlias = *sg[0].MatchedAlias
			}
			if gotAlias != tc.alias {
				t.Errorf("matchedAlias = %q, want %q", gotAlias, tc.alias)
			}

			// The listing ranks the same way: its first product belongs to the same game.
			page := list(t, s, catalog.Filter{Query: q, Sort: catalog.SortRelevance})
			if len(page.Items) == 0 || page.Items[0].Title != tc.top {
				t.Errorf("listing top item = %+v, want a product of %q", page.Items, tc.top)
			}
		})
	}
}

// Task 13c: a 2-character query matches only at the START of a word of the title or an alias
// (the beginning, or right after a space or punctuation) - never in the middle of a word.
// The want lists are complete: a hit in the middle of a word ("re" in "Dishonored",
// "ro" in "Skyrim"...) would add a title and fail the test. Both the suggestions and the listing are checked.
func TestSearch_twoCharactersMatchWordStarts(t *testing.T) {
	s := newStore(t)
	tests := []struct {
		q    string
		want []string // every game that must match, sorted
	}{
		{"re", []string{"Red Dead Redemption", "Red Dead Redemption 2"}},          // not Dishonored, Elden Ring, Call of Duty 4, ...
		{"ha", []string{"Hades", "Half-Life", "Half-Life 2"}},                     // not Batman, Uncharted ("Thief's"), ...
		{"li", []string{"Half-Life", "Half-Life 2", "Life Is Strange"}},           // "Life" after the "-" is a word start
		{"ed", []string{"Far Cry 3", "Hollow Knight", "Minecraft: Java Edition"}}, // aliases "...: Classic Edition", "...: Voidheart Edition"
		{"he", []string{"Max Payne"}},                                             // alias "Max Heat"; not "The"
		{"ac", []string{"Assassin's Creed", "Assassin's Creed Brotherhood", "Assassin's Creed II", "Assassin's Creed IV Black Flag", "Batman: Arkham City"}}, // aliases "AC", "AC2", "Batman: AC", ...
		{"ro", nil}, // "ro" only appears inside words (Horizon, Skyrim, Bloodborne, ...)
		{".*", nil}, // regex characters are plain text, not a pattern
	}
	for _, tc := range tests {
		t.Run(tc.q, func(t *testing.T) {
			var gotSuggest []string
			for _, sg := range suggest(t, s, tc.q) {
				gotSuggest = append(gotSuggest, sg.GameTitle)
			}
			var gotList []string
			seen := map[string]bool{}
			for _, it := range allItems(t, s, catalog.Filter{Query: tc.q}) {
				if !seen[it.Title] {
					seen[it.Title] = true
					gotList = append(gotList, it.Title)
				}
			}
			sort.Strings(gotSuggest)
			sort.Strings(gotList)
			if !reflect.DeepEqual(gotSuggest, tc.want) {
				t.Errorf("suggestions = %q, want %q", gotSuggest, tc.want)
			}
			if !reflect.DeepEqual(gotList, tc.want) {
				t.Errorf("listing games = %q, want %q", gotList, tc.want)
			}
		})
	}
}

func TestSearch_noiseFindsNothing(t *testing.T) {
	s := newStore(t)
	// "%%" and "__" would match EVERYTHING if the LIKE wildcards were not escaped.
	for _, q := range []string{"qwertyzz", "asdf", "%%", "__", "100%"} {
		t.Run(q, func(t *testing.T) {
			if sg := suggest(t, s, q); len(sg) != 0 {
				t.Errorf("suggestions = %+v, want none", sg)
			}
			page := list(t, s, catalog.Filter{Query: q})
			if page.Total != 0 || len(page.Items) != 0 || page.Facets.PriceRange != nil {
				t.Errorf("listing total %d, items %d, price range %v - want an empty result", page.Total, len(page.Items), page.Facets.PriceRange)
			}
			if sum(page.Facets.Platforms) != 0 || sum(page.Facets.Regions) != 0 {
				t.Errorf("facets must be empty: %+v", page.Facets)
			}
		})
	}
}

// The facets are counted over the SEARCH result, not over the whole catalog.
func TestSearch_facetsFollowQ(t *testing.T) {
	s := newStore(t)
	page := list(t, s, catalog.Filter{Query: "gta"})
	if page.Total == 0 || page.Total >= totalProducts {
		t.Fatalf("total = %d, want a part of the catalog", page.Total)
	}
	if got := sum(page.Facets.Platforms); got != page.Total {
		t.Errorf("platform facet counts sum to %d, want the total %d", got, page.Total)
	}
	if got := sum(page.Facets.Regions); got != page.Total {
		t.Errorf("region facet counts sum to %d, want the total %d", got, page.Total)
	}
	items := allItems(t, s, catalog.Filter{Query: "gta"})
	var lo, hi int64 = 1 << 62, 0
	for _, it := range items {
		if it.PriceCents != nil {
			lo, hi = min(lo, *it.PriceCents), max(hi, *it.PriceCents)
		}
	}
	if pr := page.Facets.PriceRange; pr == nil || pr.MinCents != lo || pr.MaxCents != hi {
		t.Errorf("price range = %+v, want %d-%d (the search result's in-stock prices)", pr, lo, hi)
	}
}

func TestSearch_withPlatformFilter(t *testing.T) {
	s := newStore(t)
	all := list(t, s, catalog.Filter{Query: "gta"})
	steam := list(t, s, catalog.Filter{Query: "gta", Platforms: []string{"steam"}})
	if steam.Total == 0 || steam.Total >= all.Total {
		t.Fatalf("q+platform total = %d, want between 1 and %d", steam.Total, all.Total-1)
	}
	for _, it := range allItems(t, s, catalog.Filter{Query: "gta", Platforms: []string{"steam"}}) {
		if it.Platform.Slug != "steam" {
			t.Errorf("%s is on %s, want steam only", it.Slug, it.Platform.Slug)
		}
	}
	// The platform facet ignores its own filter but keeps the search: PSN is still
	// offered (GTA V has a PSN product), with the count it would have.
	if n := counts(steam.Facets.Platforms)["psn"]; n == 0 {
		t.Errorf("platform facet lost psn: %+v", steam.Facets.Platforms)
	}
	if got := counts(steam.Facets.Platforms)["steam"]; got != steam.Total {
		t.Errorf("steam facet = %d, want %d", got, steam.Total)
	}
}

// relevance without q is exactly the popularity order.
func TestSearch_relevanceWithoutQueryIsPopularity(t *testing.T) {
	s := newStore(t)
	rel := allItems(t, s, catalog.Filter{Sort: catalog.SortRelevance})
	pop := allItems(t, s, catalog.Filter{Sort: catalog.SortPopularity})
	if len(rel) != totalProducts || !reflect.DeepEqual(rel, pop) {
		t.Fatalf("relevance without q (%d items) differs from popularity (%d items)", len(rel), len(pop))
	}
}

// A page past the end asks for the total separately; that query must use the same
// search threshold, or a typo search would be counted as 0.
func TestSearch_pagePastTheEndKeepsTheTotal(t *testing.T) {
	s := newStore(t)
	first := list(t, s, catalog.Filter{Query: "witchr 3", PageSize: 1})
	if first.Total < 2 {
		t.Fatalf("total = %d, want at least 2 (both Witcher products)", first.Total)
	}
	past := list(t, s, catalog.Filter{Query: "witchr 3", PageSize: 1, Page: 50})
	if len(past.Items) != 0 || past.Total != first.Total {
		t.Fatalf("past the end: %d items, total %d - want 0 items, total %d", len(past.Items), past.Total, first.Total)
	}
}

func TestSuggest_onePerGameAtMostSix(t *testing.T) {
	s := newStore(t)
	sg := suggest(t, s, "the") // matches many games, several products each
	if len(sg) != catalog.MaxSuggestions {
		t.Fatalf("got %d suggestions, want %d", len(sg), catalog.MaxSuggestions)
	}
	seen := map[string]bool{}
	for _, it := range sg {
		if seen[it.GameTitle] {
			t.Errorf("game %q appears twice", it.GameTitle)
		}
		seen[it.GameTitle] = true
	}
}

func TestSuggest_productChoice(t *testing.T) {
	s := newStore(t)

	// Cheapest IN-STOCK product, not the first one: RDR2 on Steam Global costs 42.99,
	// the Epic Games Europe key 21.49.
	rdr := suggest(t, s, "rdr2")[0]
	if rdr.ProductSlug != "red-dead-redemption-2-epic-games-europe" || rdr.PriceCents == nil || *rdr.PriceCents != 2149 ||
		!rdr.InStock || rdr.Platform.Slug != "epic-games" || rdr.Region.Slug != "europe" || rdr.CoverURL == nil ||
		rdr.Edition != "Standard" {
		t.Errorf("rdr2 suggestion = %+v", rdr)
	}

	// San Andreas: the Standard product is out of stock, the GOTY edition is not.
	sa := suggest(t, s, "gta sa")[0]
	if sa.ProductSlug != "grand-theft-auto-san-andreas-game-of-the-year-edition-steam-global" || !sa.InStock ||
		sa.Edition != "Game of the Year Edition" { // the edition of the PICKED product, not the game's Standard one
		t.Errorf("gta sa suggestion = %+v", sa)
	}

	// No product in stock: the game's first product, no price, inStock=false.
	// The title matched, so matchedAlias is null although the alias "Arkham Asylum" matches exactly.
	aa := suggest(t, s, "arkham asylum")[0]
	if aa.GameTitle != "Batman: Arkham Asylum" || aa.ProductSlug != "batman-arkham-asylum-steam-global" ||
		aa.InStock || aa.PriceCents != nil || aa.MatchedAlias != nil {
		t.Errorf("arkham asylum suggestion = %+v", aa)
	}
}
