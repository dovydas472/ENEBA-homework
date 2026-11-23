// Package homepage serves the home page blocks (Task 15). The page is assembled from a REGISTRY
// of blocks in the database (homepage_blocks); every block has its own endpoint and data source:
//
//	hero         GET /api/blocks/hero              homepage_slides + live prices from the catalog
//	tiles        GET /api/blocks/tiles             homepage_tiles + cover images from the catalog
//	platforms    GET /api/blocks/platforms         platform counts from the catalog
//	product_row  GET /api/blocks/products/{key}    the catalog listing, configured by the block row
//
// The frontend only knows how to DRAW each block type; which blocks exist, their order, titles and
// content all come from here. The blocks are logically separate services: they share this package
// and one database today, but each could move to its own service without the frontend noticing.
package homepage

import (
	"errors"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
)

// ErrNotFound: the block does not exist or is disabled (the API answers 404 for both).
var ErrNotFound = errors.New("homepage: block not found")

// Block types. The database allows exactly these (CHECK homepage_blocks_type_valid).
const (
	TypeHero       = "hero"
	TypeTiles      = "tiles"
	TypePlatforms  = "platforms"
	TypeProductRow = "product_row"
)

// Block is one row of homepage_blocks. Config is the raw JSON object; it is decoded per type
// (config.go), because each type has different settings.
type Block struct {
	Key    string
	Type   string
	Title  string
	Config []byte
}

// Slide is one row of homepage_slides (nil = NULL in the database).
type Slide struct {
	ID                int64
	Title             string
	Subtitle          *string
	Badge             *string
	ImageURL          string
	ImageSrcset       *string
	ImageURLMobile    string
	ImageSrcsetMobile *string
	ProductSlug       *string // set = a product slide: live price, the button goes to its product page
	CTALabel          *string
	CTAHref           *string
}

// Tile is one row of homepage_tiles.
type Tile struct {
	ID       int64
	Title    string
	Subtitle *string
	Href     string
	Accent   string
	Covers   []byte // raw JSON object or nil (no collage)
}

// ---------------------------------------------------------------------------------------------
// JSON responses. Lists are never nil, so the JSON has [] and not null.
// ---------------------------------------------------------------------------------------------

// RegistryEntry is one block of GET /api/homepage: what to draw (type), its heading and where its data is.
type RegistryEntry struct {
	Key      string `json:"key"`
	Type     string `json:"type"`
	Title    string `json:"title"`
	Endpoint string `json:"endpoint"`
}

// Registry is the body of GET /api/homepage: the enabled blocks in page order.
type Registry struct {
	Blocks []RegistryEntry `json:"blocks"`
}

// SlideImage is the picture of a slide in two crops: desktop and phone (<= 600px). A srcset lists the
// same image in several widths ("url 1280w, url 1920w"); null = only the url exists.
type SlideImage struct {
	URL          string  `json:"url"`
	Srcset       *string `json:"srcset"`
	MobileURL    string  `json:"mobileUrl"`
	MobileSrcset *string `json:"mobileSrcset"`
}

// Link is a button: its text and an internal path.
type Link struct {
	Label string `json:"label"`
	Href  string `json:"href"`
}

// HeroSlide is one slide as the frontend draws it.
type HeroSlide struct {
	ID       int64      `json:"id"`
	Title    string     `json:"title"`
	Subtitle *string    `json:"subtitle"`
	Badge    *string    `json:"badge"`
	Image    SlideImage `json:"image"`
	CTA      *Link      `json:"cta"` // null = no button
	// The product's cheapest in-stock price right now (integer cents); null = not a product slide.
	PriceCents *int64 `json:"priceCents"`
}

// Hero is the body of GET /api/blocks/hero.
type Hero struct {
	Slides []HeroSlide `json:"slides"`
}

// TileCard is one tile as the frontend draws it.
type TileCard struct {
	ID        int64    `json:"id"`
	Title     string   `json:"title"`
	Subtitle  *string  `json:"subtitle"`
	Href      string   `json:"href"`
	Accent    string   `json:"accent"`
	CoverURLs []string `json:"coverUrls"` // 0-3 different covers for the collage
}

// Tiles is the body of GET /api/blocks/tiles.
type Tiles struct {
	Tiles []TileCard `json:"tiles"`
}

// PlatformLink is one entry of the platform row ("All games" first, then one per platform).
type PlatformLink struct {
	Key   string `json:"key"` // "all" or the platform slug
	Label string `json:"label"`
	Count int64  `json:"count"` // products in the catalog
	Href  string `json:"href"`
	Icon  string `json:"icon"` // a generic icon NAME (e.g. "monitor"); the frontend draws only names it knows
}

// Platforms is the body of GET /api/blocks/platforms.
type Platforms struct {
	Items []PlatformLink `json:"items"`
}

// ProductRow is the body of GET /api/blocks/products/{key}: the cards and the "View all" link.
type ProductRow struct {
	Items       []catalog.Item `json:"items"`
	ViewAllHref string         `json:"viewAllHref"`
}
