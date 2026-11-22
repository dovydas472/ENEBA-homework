package seedgen

import (
	"reflect"
	"strings"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
	"github.com/dovydas472/ENEBA-homework/seed"
)

// The owner's rule for Task 13a: refreshing aliases must not change the catalog.
// Generate the real catalog with and without aliases; once the aliases are
// removed, the two must be identical (same games, products, offers, keys, ids).
func TestAliasesDoNotChangeTheRestOfTheCatalog(t *testing.T) {
	withAliases := realCatalog(t)

	snap, err := igdb.ParseSnapshot(seed.SnapshotJSON)
	if err != nil {
		t.Fatal(err)
	}
	for i := range snap.Games {
		snap.Games[i].Aliases = nil
	}
	without, err := Generate(snap, nil)
	if err != nil {
		t.Fatal(err)
	}

	aliases := 0
	for i := range withAliases.Games {
		aliases += len(withAliases.Games[i].Aliases)
		withAliases.Games[i].Aliases = nil
		without.Games[i].Aliases = nil
	}
	if aliases == 0 {
		t.Fatal("the real catalog has no aliases")
	}
	if !reflect.DeepEqual(withAliases, without) {
		t.Fatal("aliases changed something besides the aliases")
	}
}

func TestRealCatalogHasTheExpectedAliases(t *testing.T) {
	c := realCatalog(t)
	byTitle := map[string][]string{}
	for _, g := range c.Games {
		byTitle[g.Title] = g.Aliases
	}
	want := map[string]string{
		"Grand Theft Auto V":    "GTA V",  // from IGDB
		"Red Dead Redemption 2": "RDR2",   // from IGDB
		"Horizon Zero Dawn":     "HZD",    // hand-written extra
		"Super Mario Odyssey":   "SMO",    // hand-written extra
		"Portal":                "(none)", // IGDB's only name was "hl2.exe": dropped
		"Half-Life 2":           "HL2",    // from IGDB
		"Marvel's Spider-Man":   "SpiderMan",
	}
	for title, alias := range want {
		got := byTitle[title]
		if alias == "(none)" {
			if len(got) != 0 {
				t.Errorf("%s: want no aliases, got %q", title, got)
			}
			continue
		}
		found := false
		for _, a := range got {
			found = found || a == alias
		}
		if !found {
			t.Errorf("%s: alias %q missing, got %q", title, alias, got)
		}
	}
}

func TestParseExtraAliases(t *testing.T) {
	got, err := ParseExtraAliases([]byte(`{"note":"x","aliases":[{"igdb_id":1,"alias":"HZD","reason":"why"}]}`))
	if err != nil || len(got) != 1 || got[0].Alias != "HZD" {
		t.Fatalf("got %+v, %v", got, err)
	}
	for _, bad := range []string{
		`not json`,
		`{"aliases":[{"igdb_id":0,"alias":"HZD","reason":"why"}]}`,
		`{"aliases":[{"igdb_id":1,"alias":"  ","reason":"why"}]}`,
		`{"aliases":[{"igdb_id":1,"alias":"HZD","reason":""}]}`,
	} {
		if _, err := ParseExtraAliases([]byte(bad)); err == nil {
			t.Errorf("ParseExtraAliases(%s): want an error", bad)
		}
	}
}

func TestGenerateRejectsBadExtraAliases(t *testing.T) {
	s := fakeSnapshot(2) // games "Game 0" (id 1000) and "Game 1" (id 1001)
	s.Games[0].Aliases = []string{"G0"}
	tests := map[string]ExtraAlias{
		"unknown game":           {IGDBID: 999, Alias: "X", Reason: "r"},
		"same as the title":      {IGDBID: 1000, Alias: "game 0", Reason: "r"},
		"same as an IGDB alias":  {IGDBID: 1000, Alias: "g0", Reason: "r"},
		"same after space fixes": {IGDBID: 1000, Alias: " G0 ", Reason: "r"},
	}
	for name, extra := range tests {
		if _, err := Generate(s, []ExtraAlias{extra}); err == nil {
			t.Errorf("%s: want an error", name)
		}
	}

	c, err := Generate(s, []ExtraAlias{{IGDBID: 1000, Alias: "Zero", Reason: "r"}})
	if err != nil {
		t.Fatal(err)
	}
	if got := c.Games[0].Aliases; !reflect.DeepEqual(got, []string{"G0", "Zero"}) {
		t.Fatalf("aliases = %q, want IGDB first, then the extra", got)
	}
}

func TestValidateRejectsBadAliases(t *testing.T) {
	for name, aliases := range map[string][]string{
		"blank":          {" "},
		"case duplicate": {"GTA V", "gta v"},
		"the title":      {"GAME 0"},
	} {
		c, _ := Generate(fakeSnapshot(50), nil)
		c.Games[0].Aliases = aliases
		if _, err := Validate(c); err == nil || !strings.Contains(err.Error(), "alias") {
			t.Errorf("%s: want an alias error, got %v", name, err)
		}
	}
}
