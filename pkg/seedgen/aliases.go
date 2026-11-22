package seedgen

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
)

// ExtraAlias is one hand-written search alias from seed/search_aliases_extra.json:
// an obvious abbreviation that IGDB's alternative_names does not have (e.g. "HZD").
type ExtraAlias struct {
	IGDBID int64  `json:"igdb_id"` // which snapshot game it belongs to
	Alias  string `json:"alias"`
	Reason string `json:"reason"` // one line: why it is needed (kept in the file, not in the database)
}

// extraAliasesFile is the shape of seed/search_aliases_extra.json.
type extraAliasesFile struct {
	Note    string       `json:"note"`
	Aliases []ExtraAlias `json:"aliases"`
}

// ParseExtraAliases decodes the extras file and checks that every entry has an
// id, an alias and a reason. Whether the game exists is checked by Generate,
// which has the snapshot.
func ParseExtraAliases(data []byte) ([]ExtraAlias, error) {
	var f extraAliasesFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("search_aliases_extra.json is not valid JSON: %w", err)
	}
	for i, a := range f.Aliases {
		if a.IGDBID <= 0 || strings.TrimSpace(a.Alias) == "" || strings.TrimSpace(a.Reason) == "" {
			return nil, fmt.Errorf("search_aliases_extra.json entry #%d needs igdb_id, alias and reason", i)
		}
	}
	return f.Aliases, nil
}

// aliasesFor merges the snapshot aliases of one game (already cleaned by
// igdb.CleanAliases) with its extra ones. An extra alias that is already the
// title or a snapshot alias is an ERROR, not silently dropped: after an alias
// refresh IGDB may start listing it, and then the extras file must lose that
// entry - the file stays as short as possible.
func aliasesFor(g igdb.Game, extra []ExtraAlias) ([]string, error) {
	out := append([]string{}, g.Aliases...)
	known := map[string]bool{strings.ToLower(g.Name): true}
	for _, a := range out {
		known[strings.ToLower(a)] = true
	}
	for _, e := range extra {
		alias := strings.Join(strings.Fields(e.Alias), " ")
		if known[strings.ToLower(alias)] {
			return nil, fmt.Errorf("extra alias %q of %q is already the title or an IGDB alias: "+
				"remove it from seed/search_aliases_extra.json", alias, g.Name)
		}
		known[strings.ToLower(alias)] = true
		out = append(out, alias)
	}
	return out, nil
}

// extrasByGame groups the extra aliases by IGDB id and fails for an id that is
// not in the snapshot (a typo in the file must not be ignored).
func extrasByGame(s igdb.Snapshot, extra []ExtraAlias) (map[int64][]ExtraAlias, error) {
	inSnapshot := map[int64]bool{}
	for _, g := range s.Games {
		inSnapshot[g.IGDBID] = true
	}
	out := map[int64][]ExtraAlias{}
	for _, e := range extra {
		if !inSnapshot[e.IGDBID] {
			return nil, fmt.Errorf("extra alias %q: igdb_id %d is not in the snapshot", e.Alias, e.IGDBID)
		}
		out[e.IGDBID] = append(out[e.IGDBID], e)
	}
	return out, nil
}
