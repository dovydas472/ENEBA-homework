package homepage

import (
	"strings"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
)

func TestParseProductRowConfig_valid(t *testing.T) {
	c, err := ParseProductRowConfig([]byte(`{"sort": "discount", "limit": 5, "viewAllHref": "/store?sort=discount"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := ProductRowConfig{Sort: catalog.SortDiscount, Limit: 5, ViewAllHref: "/store?sort=discount"}
	if c != want {
		t.Errorf("got %+v, want %+v", c, want)
	}
}

// A config mistake must be an error (500), never a silent default.
func TestParseProductRowConfig_rejectsBadValues(t *testing.T) {
	cases := map[string]string{
		"unknown field":         `{"sort": "discount", "limit": 5, "viewAllHref": "/store", "colour": "red"}`,
		"typo in a field name":  `{"sort": "discount", "limt": 5, "viewAllHref": "/store"}`,
		"unknown sort":          `{"sort": "cheapest", "limit": 5, "viewAllHref": "/store"}`,
		"relevance needs a q":   `{"sort": "relevance", "limit": 5, "viewAllHref": "/store"}`,
		"limit 0":               `{"sort": "newest", "limit": 0, "viewAllHref": "/store"}`,
		"limit too big":         `{"sort": "newest", "limit": 13, "viewAllHref": "/store"}`,
		"external link":         `{"sort": "newest", "limit": 5, "viewAllHref": "https://example.com"}`,
		"protocol-relative":     `{"sort": "newest", "limit": 5, "viewAllHref": "//example.com"}`,
		"missing link":          `{"sort": "newest", "limit": 5}`,
		"wrong type":            `{"sort": "newest", "limit": "5", "viewAllHref": "/store"}`,
		"two objects":           `{"sort": "newest", "limit": 5, "viewAllHref": "/store"} {}`,
		"not an object at all":  `[1, 2]`,
		"empty object":          `{}`,
		"javascript: is no url": `{"sort": "newest", "limit": 5, "viewAllHref": "javascript:alert(1)"}`,
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseProductRowConfig([]byte(raw)); err == nil {
				t.Errorf("expected an error for %s", raw)
			}
		})
	}
}

func TestParsePlatformsConfig(t *testing.T) {
	c, err := ParsePlatformsConfig([]byte(`{"allLabel": "All games", "allIcon": "layout-grid", "defaultIcon": "gamepad-2", "icons": {"steam": "monitor"}}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := c.IconFor("steam"); got != "monitor" {
		t.Errorf("IconFor(steam) = %q, want monitor", got)
	}
	if got := c.IconFor("a-new-platform"); got != "gamepad-2" {
		t.Errorf("IconFor(unknown) = %q, want the default gamepad-2", got)
	}

	for name, raw := range map[string]string{
		"no label":        `{"allLabel": "", "allIcon": "layout-grid", "defaultIcon": "gamepad-2", "icons": {}}`,
		"bad icon name":   `{"allLabel": "All", "allIcon": "Layout Grid", "defaultIcon": "gamepad-2", "icons": {}}`,
		"bad mapped icon": `{"allLabel": "All", "allIcon": "layout-grid", "defaultIcon": "gamepad-2", "icons": {"steam": "<svg>"}}`,
		"unknown field":   `{"allLabel": "All", "allIcon": "layout-grid", "defaultIcon": "gamepad-2", "icons": {}, "x": 1}`,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParsePlatformsConfig([]byte(raw)); err == nil {
				t.Errorf("expected an error for %s", raw)
			}
		})
	}
}

func TestParseCoversConfig(t *testing.T) {
	c, err := ParseCoversConfig(nil) // SQL NULL
	if err != nil || c != nil {
		t.Fatalf("NULL covers: got %+v, %v; want nil, nil (a tile without a collage)", c, err)
	}
	c, err = ParseCoversConfig([]byte(`{"sort": "popularity", "platform": "steam"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.Sort != catalog.SortPopularity || c.Platform != "steam" {
		t.Errorf("got %+v", c)
	}
	if _, err := ParseCoversConfig([]byte(`{"sort": "nope"}`)); err == nil || !strings.Contains(err.Error(), "sort") {
		t.Errorf("unknown sort: got %v, want a sort error", err)
	}
}

// The endpoint is built from the type in code: a database row can never point the page elsewhere.
func TestEndpoint(t *testing.T) {
	cases := []struct {
		block Block
		want  string
		ok    bool
	}{
		{Block{Key: "hero", Type: TypeHero}, "/api/blocks/hero", true},
		{Block{Key: "tiles", Type: TypeTiles}, "/api/blocks/tiles", true},
		{Block{Key: "platforms", Type: TypePlatforms}, "/api/blocks/platforms", true},
		{Block{Key: "new-releases", Type: TypeProductRow}, "/api/blocks/products/new-releases", true},
		{Block{Key: "x", Type: "video_wall"}, "", false},
	}
	for _, c := range cases {
		got, ok := Endpoint(c.block)
		if got != c.want || ok != c.ok {
			t.Errorf("Endpoint(%+v) = %q, %v; want %q, %v", c.block, got, ok, c.want, c.ok)
		}
	}
}
