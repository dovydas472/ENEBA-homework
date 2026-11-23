package homepage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"slices"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
)

// The JSON settings in the database are checked here, strictly: an unknown field, a wrong type or a
// value out of range is an ERROR (the API answers 500 and logs it), never a silent default. A typo in
// a config must be noticed, not quietly show the wrong products.

// MaxRowItems is the most cards a product row may ask for.
const MaxRowItems = 12

// rowSorts are the sorts a product row may use: every Store sort except "relevance", which only
// means something together with a search text.
var rowSorts = []catalog.Sort{
	catalog.SortPopularity, catalog.SortDiscount, catalog.SortNewest,
	catalog.SortPriceAsc, catalog.SortPriceDesc, catalog.SortTitle,
}

// internalHref: a path on our own site ("/store?sort=discount"), not "//other.site" or "javascript:".
// The same rule as the CHECK constraints of the tables.
var internalHref = regexp.MustCompile(`^/([^/]|$)`)

// iconName: a lucide-style icon name ("gamepad-2"). The frontend maps names it knows to icons.
var iconName = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// decodeStrict decodes a JSON object and rejects unknown fields and trailing data.
func decodeStrict(raw []byte, out any) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		return err
	}
	if dec.More() {
		return fmt.Errorf("unexpected data after the JSON object")
	}
	return nil
}

// ProductRowConfig is homepage_blocks.config of a product_row block.
type ProductRowConfig struct {
	Sort        catalog.Sort `json:"sort"`
	Limit       int          `json:"limit"`
	ViewAllHref string       `json:"viewAllHref"`
}

// ParseProductRowConfig decodes and validates a product row's config.
func ParseProductRowConfig(raw []byte) (ProductRowConfig, error) {
	var c ProductRowConfig
	if err := decodeStrict(raw, &c); err != nil {
		return ProductRowConfig{}, fmt.Errorf("product row config: %w", err)
	}
	if !slices.Contains(rowSorts, c.Sort) {
		return ProductRowConfig{}, fmt.Errorf("product row config: sort %q is not allowed", c.Sort)
	}
	if c.Limit < 1 || c.Limit > MaxRowItems {
		return ProductRowConfig{}, fmt.Errorf("product row config: limit %d is not 1-%d", c.Limit, MaxRowItems)
	}
	if !internalHref.MatchString(c.ViewAllHref) {
		return ProductRowConfig{}, fmt.Errorf("product row config: viewAllHref %q is not an internal path", c.ViewAllHref)
	}
	return c, nil
}

// PlatformsConfig is homepage_blocks.config of the platforms block: the "All games" entry and which
// generic icon each platform gets (no brand logos).
type PlatformsConfig struct {
	AllLabel    string            `json:"allLabel"`
	AllIcon     string            `json:"allIcon"`
	DefaultIcon string            `json:"defaultIcon"` // a platform that is not in Icons
	Icons       map[string]string `json:"icons"`       // platform slug -> icon name
}

// ParsePlatformsConfig decodes and validates the platforms block's config.
func ParsePlatformsConfig(raw []byte) (PlatformsConfig, error) {
	var c PlatformsConfig
	if err := decodeStrict(raw, &c); err != nil {
		return PlatformsConfig{}, fmt.Errorf("platforms config: %w", err)
	}
	if c.AllLabel == "" {
		return PlatformsConfig{}, fmt.Errorf("platforms config: allLabel is empty")
	}
	for _, icon := range append([]string{c.AllIcon, c.DefaultIcon}, mapValues(c.Icons)...) {
		if !iconName.MatchString(icon) {
			return PlatformsConfig{}, fmt.Errorf("platforms config: %q is not an icon name", icon)
		}
	}
	return c, nil
}

// IconFor returns the icon of a platform: its own, or the default one.
func (c PlatformsConfig) IconFor(slug string) string {
	if icon, ok := c.Icons[slug]; ok {
		return icon
	}
	return c.DefaultIcon
}

// CoversConfig is homepage_tiles.covers: which catalog products give a tile its cover collage.
type CoversConfig struct {
	Sort     catalog.Sort `json:"sort"`
	Platform string       `json:"platform"` // optional platform slug
}

// ParseCoversConfig decodes a tile's covers setting. nil (SQL NULL) = no collage: (nil, nil).
func ParseCoversConfig(raw []byte) (*CoversConfig, error) {
	if raw == nil {
		return nil, nil
	}
	var c CoversConfig
	if err := decodeStrict(raw, &c); err != nil {
		return nil, fmt.Errorf("tile covers: %w", err)
	}
	if !slices.Contains(rowSorts, c.Sort) {
		return nil, fmt.Errorf("tile covers: sort %q is not allowed", c.Sort)
	}
	return &c, nil
}

func mapValues(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for _, v := range m {
		out = append(out, v)
	}
	return out
}

// Endpoint is where the frontend fetches a block's content. It is BUILT here from the type (and the key
// of a product row), not stored in the database, so a row can never point the page at a foreign URL.
// ok = false for a type this code does not know (the CHECK constraint makes that impossible today).
func Endpoint(b Block) (string, bool) {
	switch b.Type {
	case TypeHero:
		return "/api/blocks/hero", true
	case TypeTiles:
		return "/api/blocks/tiles", true
	case TypePlatforms:
		return "/api/blocks/platforms", true
	case TypeProductRow:
		return "/api/blocks/products/" + b.Key, true
	}
	return "", false
}
