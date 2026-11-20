package igdb

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestTrimSummary(t *testing.T) {
	long := strings.Repeat("word ", 100) // 500 chars, no sentence end
	tests := []struct {
		name, in, want string
	}{
		{"empty", "  ", ""},
		{"one sentence kept", "A short game.", "A short game."},
		{"max two sentences", "One. Two! Three? Four.", "One. Two!"},
		{"whitespace collapsed", "One.\n\nTwo   words.", "One. Two words."},
		{"second sentence dropped when too long", "Short one. " + strings.Repeat("x", 295) + ".", "Short one."},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := TrimSummary(tc.in, 300); got != tc.want {
				t.Fatalf("TrimSummary() = %q, want %q", got, tc.want)
			}
		})
	}

	got := TrimSummary(long, 300)
	if utf8.RuneCountInString(got) > 300 || !strings.HasSuffix(got, "word…") {
		t.Fatalf("long first sentence not cut on a word boundary: %q (%d chars)", got, utf8.RuneCountInString(got))
	}
}

func intp(i int) *int { return &i }

func rawGame(id int64, ratings int) APIGame {
	g := APIGame{ID: id, Name: "Game", Slug: "game", Summary: "Fun.", TotalRatingCount: ratings,
		Platforms: []int{PlatformPC}, GameType: intp(0)}
	g.Cover = &APICover{ImageID: "co123"}
	return g
}

func TestSelectFilters(t *testing.T) {
	erotic := rawGame(2, 900)
	erotic.Themes = []int{1, ThemeErotic}
	dlc := rawGame(3, 800)
	dlc.GameType = intp(1)
	noCover := rawGame(4, 700)
	noCover.Cover = nil
	noSummary := rawGame(5, 600)
	noSummary.Summary = " "
	oldConsoleOnly := rawGame(6, 500)
	oldConsoleOnly.Platforms = []int{9} // PS3
	edition := rawGame(7, 400)
	parent := int64(1)
	edition.VersionParent = &parent
	remake := rawGame(8, 300)
	remake.GameType = intp(8)

	got := Select([]APIGame{rawGame(1, 100), erotic, dlc, noCover, noSummary, oldConsoleOnly, edition, remake}, 50)
	if len(got) != 2 || got[0].IGDBID != 8 || got[1].IGDBID != 1 {
		t.Fatalf("expected the remake (8) then the main game (1), got %+v", got)
	}
}

func TestSelectOrderAndLimit(t *testing.T) {
	// Equal rating counts are ordered by IGDB id, whatever the input order.
	got := Select([]APIGame{rawGame(30, 5), rawGame(10, 5), rawGame(20, 9)}, 2)
	if len(got) != 2 || got[0].IGDBID != 20 || got[1].IGDBID != 10 {
		t.Fatalf("unexpected order/limit: %+v", got)
	}
}

func TestConvertFields(t *testing.T) {
	a := rawGame(1, 10)
	a.FirstReleaseDate = 1431993600 // 2015-05-19 00:00 UTC
	a.Platforms = []int{130, 9, 6}  // PS3 (9) is dropped, the rest sorted
	a.InvolvedCompanies = []APIInvolvedCompany{{Company: APIName{Name: "Studio"}, Developer: true, Publisher: true}}
	g, ok := convert(a)
	if !ok {
		t.Fatal("game should pass")
	}
	if g.ReleaseDate != "2015-05-19" || len(g.Platforms) != 2 || g.Platforms[0] != 6 || g.Platforms[1] != 130 {
		t.Fatalf("unexpected conversion: %+v", g)
	}
	if len(g.Developers) != 1 || len(g.Publishers) != 1 || g.Developers[0] != "Studio" {
		t.Fatalf("companies not split: %+v", g)
	}
	if g.CoverURL() != "https://images.igdb.com/igdb/image/upload/t_cover_big/co123.jpg" {
		t.Fatalf("cover url: %s", g.CoverURL())
	}
}
