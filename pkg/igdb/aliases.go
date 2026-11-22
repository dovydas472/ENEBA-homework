package igdb

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

// MaxAliases is how many alternative names one game keeps at most. A few
// abbreviations and short titles are what search needs; a long tail of
// regional titles would only add noise to the fuzzy matching.
const MaxAliases = 10

// AliasesPageSize is IGDB's maximum `limit` per request. A page shorter than
// this is the last one.
const AliasesPageSize = 500

// AliasesQuery returns the Apicalypse query for the alternative names of the
// given games, one page of up to 500 rows. Sorted by id, so the result (and
// therefore which aliases survive the cap) does not depend on IGDB's row order.
func AliasesQuery(igdbIDs []int64, offset int) string {
	ids := make([]string, len(igdbIDs))
	for i, id := range igdbIDs {
		ids[i] = strconv.FormatInt(id, 10)
	}
	return fmt.Sprintf("fields id, name, comment, game; where game = (%s); sort id asc; limit %d; offset %d;",
		strings.Join(ids, ","), AliasesPageSize, offset)
}

// APIAlternativeName is one row of IGDB's alternative_names endpoint.
type APIAlternativeName struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Comment string `json:"comment"` // e.g. "Acronym", "Japanese title - romanization"; informational only
	Game    int64  `json:"game"`
}

// GroupAliases sorts the raw rows by id and groups their names per game id.
func GroupAliases(rows []APIAlternativeName) map[int64][]string {
	sorted := append([]APIAlternativeName(nil), rows...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].ID < sorted[j].ID })
	out := map[int64][]string{}
	for _, r := range sorted {
		out[r.Game] = append(out[r.Game], r.Name)
	}
	return out
}

// CleanAliases keeps only the alternative names that help search:
//   - whitespace trimmed and collapsed ("GTA  V " -> "GTA V"), empty ones dropped;
//   - Latin script only: every LETTER must be Latin (digits, spaces and
//     punctuation are fine). A Japanese or Cyrillic title cannot be typed on
//     our search box's typical keyboard and would never match a Latin query;
//   - no executable file names: IGDB lists names such as "portal2.exe" (and
//     "hl2.exe" under Portal, which would make a search for "hl2" find Portal);
//   - not the title itself and no duplicates, both compared case-insensitively
//     ("GTA V" and "gta v" are the same alias);
//   - at most max, in the given order (IGDB id order: oldest entries first).
//
// The result is never nil, so the snapshot always has "aliases": [].
func CleanAliases(title string, names []string, max int) []string {
	out := []string{}
	seen := map[string]bool{strings.ToLower(normalizeSpaces(title)): true}
	for _, n := range names {
		n = normalizeSpaces(n)
		if n == "" || !isLatin(n) || strings.HasSuffix(strings.ToLower(n), ".exe") {
			continue
		}
		key := strings.ToLower(n)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, n)
		if len(out) == max {
			break
		}
	}
	return out
}

func normalizeSpaces(s string) string { return strings.Join(strings.Fields(s), " ") }

// isLatin reports whether every letter of s is a Latin letter (é, ü count too).
func isLatin(s string) bool {
	for _, r := range s {
		if unicode.IsLetter(r) && !unicode.Is(unicode.Latin, r) {
			return false
		}
	}
	return true
}
