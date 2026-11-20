// Package igdb contains everything about the IGDB snapshot:
//
//   - snapshot.go: the format of seed/igdb_snapshot.json (written by cmd/igdb-snapshot,
//     read by cmd/seed),
//   - client.go:   the small Twitch OAuth + IGDB API client (used only locally),
//   - select.go:   the pure rules that turn the raw API answer into the snapshot.
//
// IGDB is called only by the owner, once, on their own PC. The app and the seed never
// call IGDB: they read the committed JSON file.
package igdb

import (
	"encoding/json"
	"errors"
	"fmt"
)

// IGDB platform ids that we can sell keys for (see pkg/seedgen for the mapping to
// activation services). Older consoles (PS3, Xbox 360, Wii U ...) are ignored on
// purpose: nobody sells activation keys for them.
const (
	PlatformPC          = 6   // PC (Microsoft Windows)
	PlatformPS4         = 48  // PlayStation 4
	PlatformPS5         = 167 // PlayStation 5
	PlatformXboxOne     = 49  // Xbox One
	PlatformXboxSeries  = 169 // Xbox Series X|S
	PlatformSwitch      = 130 // Nintendo Switch
	PlatformSwitch2     = 508 // Nintendo Switch 2
	ThemeErotic         = 42  // excluded: this is a public demo
	coverURLPrefix      = "https://images.igdb.com/igdb/image/upload/t_cover_big/"
	SnapshotSource      = "IGDB"
	SnapshotAttribution = "Data provided by IGDB"
)

// SupportedPlatforms is the set of IGDB platform ids listed above.
var SupportedPlatforms = map[int]bool{
	PlatformPC: true, PlatformPS4: true, PlatformPS5: true,
	PlatformXboxOne: true, PlatformXboxSeries: true,
	PlatformSwitch: true, PlatformSwitch2: true,
}

// Snapshot is the whole content of seed/igdb_snapshot.json.
type Snapshot struct {
	Header Header `json:"header"`
	Games  []Game `json:"games"`
}

// Header says where the data came from and how it was selected, so the file
// explains itself (and the attribution travels with the data).
type Header struct {
	Source      string `json:"source"`      // always "IGDB"
	Attribution string `json:"attribution"` // "Data provided by IGDB"
	FetchedAt   string `json:"fetched_at"`  // RFC 3339, UTC
	Endpoint    string `json:"endpoint"`    // the IGDB endpoint that was queried
	Query       string `json:"query"`       // the exact Apicalypse query
	Filters     string `json:"filters"`     // the filters applied in Go after the query
}

// Game is one game in the snapshot: only the fields the seed needs, already cleaned.
type Game struct {
	IGDBID           int64    `json:"igdb_id"`
	Name             string   `json:"name"`
	Slug             string   `json:"slug"`
	Summary          string   `json:"summary"`      // trimmed to ~2 sentences / ~300 chars
	Genres           []string `json:"genres"`       // display names
	ReleaseDate      string   `json:"release_date"` // YYYY-MM-DD (UTC) or "" if unknown
	Developers       []string `json:"developers"`
	Publishers       []string `json:"publishers"`
	CoverImageID     string   `json:"cover_image_id"`
	TotalRatingCount int      `json:"total_rating_count"` // becomes games.popularity
	Platforms        []int    `json:"platforms"`          // IGDB platform ids (supported ones only)
}

// CoverURL builds the public CDN URL of the cover. Nothing is downloaded: the
// browser loads the image straight from images.igdb.com.
func (g Game) CoverURL() string {
	return coverURLPrefix + g.CoverImageID + ".jpg"
}

// ParseSnapshot decodes the JSON file and checks the few things the seed relies on.
func ParseSnapshot(data []byte) (Snapshot, error) {
	var s Snapshot
	if err := json.Unmarshal(data, &s); err != nil {
		return Snapshot{}, fmt.Errorf("snapshot is not valid JSON: %w", err)
	}
	if s.Header.Source != SnapshotSource {
		return Snapshot{}, errors.New(`snapshot header.source must be "IGDB"`)
	}
	if len(s.Games) == 0 {
		return Snapshot{}, errors.New("snapshot has no games")
	}
	seen := map[int64]bool{}
	for i, g := range s.Games {
		switch {
		case g.IGDBID <= 0:
			return Snapshot{}, fmt.Errorf("game #%d has no igdb_id", i)
		case seen[g.IGDBID]:
			return Snapshot{}, fmt.Errorf("igdb_id %d appears twice", g.IGDBID)
		case g.Name == "" || g.Slug == "" || g.CoverImageID == "":
			return Snapshot{}, fmt.Errorf("game igdb_id=%d is missing name, slug or cover", g.IGDBID)
		case len(g.Platforms) == 0:
			return Snapshot{}, fmt.Errorf("game igdb_id=%d has no supported platform", g.IGDBID)
		}
		seen[g.IGDBID] = true
	}
	return s, nil
}
