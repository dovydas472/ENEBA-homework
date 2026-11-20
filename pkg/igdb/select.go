package igdb

import (
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

// GamesQuery is the one Apicalypse query sent to POST /v4/games. It is stored in the
// snapshot header, so anyone can see exactly how the games were chosen.
//
//   - game_type = (0,8): 0 = main game, 8 = remake (a full new game). This leaves out
//     DLC, expansions, bundles, editions ("expanded game"), remasters, ports, mods ...
//   - version_parent = null: editions/versions of another game are left out too.
//   - cover / summary must exist; the Erotic theme (42) is excluded (public demo).
//   - platforms = (...): at least one platform we can sell a key for.
//   - sorted by total_rating_count (how many ratings = how well known), 60 candidates.
const GamesQuery = `fields id, name, slug, summary, genres.name, first_release_date, ` +
	`involved_companies.company.name, involved_companies.developer, involved_companies.publisher, ` +
	`cover.image_id, total_rating_count, platforms, themes, game_type, version_parent; ` +
	`where game_type = (0,8) & version_parent = null & cover != null & summary != null ` +
	`& themes != (42) & total_rating_count != null & platforms = (6,48,167,49,169,130,508); ` +
	`sort total_rating_count desc; limit 60;`

// SelectFilters describes the checks Select repeats in Go (stored in the header).
const SelectFilters = "game_type in (0,8); no version_parent; cover image_id and summary present; " +
	"no Erotic theme (42); at least one supported platform; best 50 by total_rating_count desc, then igdb_id asc; " +
	"summary trimmed to max 2 sentences / 300 characters"

// SnapshotSize is how many games the snapshot keeps.
const SnapshotSize = 50

// APIGame is one game exactly as IGDB returns it for GamesQuery.
type APIGame struct {
	ID                int64                `json:"id"`
	Name              string               `json:"name"`
	Slug              string               `json:"slug"`
	Summary           string               `json:"summary"`
	FirstReleaseDate  int64                `json:"first_release_date"` // Unix seconds, 0 = unknown
	TotalRatingCount  int                  `json:"total_rating_count"`
	Platforms         []int                `json:"platforms"`
	Themes            []int                `json:"themes"`
	GameType          *int                 `json:"game_type"`      // nil = not set
	VersionParent     *int64               `json:"version_parent"` // nil = not an edition of another game
	Genres            []APIName            `json:"genres"`
	Cover             *APICover            `json:"cover"` // nil = no cover
	InvolvedCompanies []APIInvolvedCompany `json:"involved_companies"`
}

// APIName is an expanded IGDB reference that only carries a name (genres, companies).
type APIName struct {
	Name string `json:"name"`
}

// APICover is the expanded cover reference; image_id is the CDN file name.
type APICover struct {
	ImageID string `json:"image_id"`
}

// APIInvolvedCompany links a company to a game with its role.
type APIInvolvedCompany struct {
	Company   APIName `json:"company"`
	Developer bool    `json:"developer"`
	Publisher bool    `json:"publisher"`
}

// allowedGameTypes: 0 = main game, 8 = remake.
var allowedGameTypes = map[int]bool{0: true, 8: true}

// Select applies the filters again in Go (defence in depth: the query already
// filters, but the rules must hold even if IGDB interprets a filter differently),
// sorts by popularity and returns the best n games, already cleaned.
func Select(raw []APIGame, n int) []Game {
	var games []Game
	for _, a := range raw {
		g, ok := convert(a)
		if ok {
			games = append(games, g)
		}
	}
	// Stable order: most ratings first; equal counts by IGDB id, so the result never
	// depends on the order in which IGDB returned the rows.
	sort.SliceStable(games, func(i, j int) bool {
		if games[i].TotalRatingCount != games[j].TotalRatingCount {
			return games[i].TotalRatingCount > games[j].TotalRatingCount
		}
		return games[i].IGDBID < games[j].IGDBID
	})
	if len(games) > n {
		games = games[:n]
	}
	return games
}

// convert checks one raw game and turns it into a snapshot Game.
// ok=false means the game does not pass a filter.
func convert(a APIGame) (Game, bool) {
	if a.GameType == nil || !allowedGameTypes[*a.GameType] || a.VersionParent != nil {
		return Game{}, false
	}
	if a.Cover == nil || a.Cover.ImageID == "" || a.Name == "" || a.Slug == "" {
		return Game{}, false
	}
	for _, t := range a.Themes {
		if t == ThemeErotic {
			return Game{}, false
		}
	}
	summary := TrimSummary(a.Summary, 300)
	if summary == "" {
		return Game{}, false
	}
	var platforms []int
	for _, p := range a.Platforms {
		if SupportedPlatforms[p] {
			platforms = append(platforms, p)
		}
	}
	if len(platforms) == 0 {
		return Game{}, false
	}
	sort.Ints(platforms)

	g := Game{
		IGDBID:           a.ID,
		Name:             strings.TrimSpace(a.Name),
		Slug:             a.Slug,
		Summary:          summary,
		CoverImageID:     a.Cover.ImageID,
		TotalRatingCount: a.TotalRatingCount,
		Platforms:        platforms,
		Genres:           []string{},
		Developers:       []string{},
		Publishers:       []string{},
	}
	if a.FirstReleaseDate > 0 {
		g.ReleaseDate = time.Unix(a.FirstReleaseDate, 0).UTC().Format("2006-01-02")
	}
	for _, x := range a.Genres {
		g.Genres = append(g.Genres, x.Name)
	}
	for _, ic := range a.InvolvedCompanies {
		if ic.Developer {
			g.Developers = appendUnique(g.Developers, ic.Company.Name)
		}
		if ic.Publisher {
			g.Publishers = appendUnique(g.Publishers, ic.Company.Name)
		}
	}
	return g, true
}

func appendUnique(list []string, s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return list
	}
	for _, x := range list {
		if x == s {
			return list
		}
	}
	return append(list, s)
}

// TrimSummary shortens a description to at most 2 sentences and at most max
// characters, cutting on a sentence boundary. If even the first sentence is too
// long, it is cut on a word boundary and ends with "…".
func TrimSummary(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ") // collapse newlines and repeated spaces
	if s == "" {
		return ""
	}
	out := ""
	for i, sentence := range splitSentences(s) {
		if i == 2 {
			break
		}
		candidate := sentence
		if out != "" {
			candidate = out + " " + sentence
		}
		if utf8.RuneCountInString(candidate) > max {
			break
		}
		out = candidate
	}
	if out != "" {
		return out
	}
	// The first sentence alone is longer than max: cut at the last space that fits.
	runes := []rune(s)
	cut := string(runes[:max-1])
	if i := strings.LastIndex(cut, " "); i > 0 {
		cut = cut[:i]
	}
	return strings.TrimRight(cut, " ,;:-") + "…"
}

// splitSentences splits after ".", "!" or "?" when a space follows.
// Simple on purpose: good enough for game descriptions.
func splitSentences(s string) []string {
	var out []string
	start := 0
	for i := 0; i < len(s)-1; i++ {
		if (s[i] == '.' || s[i] == '!' || s[i] == '?') && s[i+1] == ' ' {
			out = append(out, s[start:i+1])
			start = i + 2
		}
	}
	if start < len(s) {
		out = append(out, s[start:])
	}
	return out
}
