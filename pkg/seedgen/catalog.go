// Package seedgen turns the committed IGDB snapshot into the full demo catalog
// (platforms, regions, games + their search aliases, products, sellers, offers, keys) and writes it to
// the database.
//
//   - catalog.go:  the row types and the fixed lookup data (platforms, regions, sellers),
//   - rules.go:    small pure rule functions (platform mapping, MSRP, price rounding ...),
//   - generate.go: Generate (deterministic, fixed RNG seed) + Validate,
//   - db.go:       Reset / Insert / Counts / Checksum inside one transaction.
//
// Rows refer to each other by slug (natural keys), never by numeric id: the
// database owns the ids (GENERATED ALWAYS AS IDENTITY), see docs/DATA_MODEL.md.
package seedgen

import "time"

// Catalog is everything the seed writes, as plain Go values.
type Catalog struct {
	Platforms []Platform
	Regions   []Region
	Sellers   []Seller
	Games     []Game
	Products  []Product
	Offers    []Offer
	Keys      []Key
}

// Platform is an activation service (shown as a text badge, no logo).
type Platform struct {
	Slug, Name string
	SortOrder  int
}

// Region is where a key can be activated.
type Region struct {
	Slug, Name string
	SortOrder  int
}

// Seller is a fictional marketplace seller.
type Seller struct {
	Slug, Name string
	// Rating is the exact decimal as text ("9.91"), so no float is involved; nil = "New seller".
	Rating       *string
	ReviewsCount int
}

// Game is one row of the games table.
type Game struct {
	Slug, Title, Description string
	Genres                   []string
	ReleaseDate              *time.Time // date only; nil = unknown
	Developer, Publisher     *string    // nil = unknown
	CoverURL                 string
	Popularity               int
	IGDBID                   int64
	Aliases                  []string // rows of game_aliases, in this order (search only)
}

// Product is one game on one platform for one region in one edition.
type Product struct {
	Slug                               string
	GameSlug, PlatformSlug, RegionSlug string
	Edition                            string
	MSRPCents                          *int // nil = unknown -> no discount badge
}

// Offer is one seller's price for one product. Identified by (product, seller).
type Offer struct {
	ProductSlug, SellerSlug string
	PriceCents              int
	IsActive                bool
}

// Key is one fake activation code of an offer.
type Key struct {
	ProductSlug, SellerSlug string // = the offer
	Code                    string
	Status                  string     // available | reserved | sold
	ReservedUntil           *time.Time // only when reserved (always in the past here = expired)
	SoldAt                  *time.Time // only when sold
	CreatedAt               time.Time
}

// Key statuses (same values as the CHECK constraint in migration 00002).
const (
	StatusAvailable = "available"
	StatusReserved  = "reserved"
	StatusSold      = "sold"
)

// Platform slugs used by the rules.
const (
	Steam          = "steam"
	XboxLive       = "xbox-live"
	PSN            = "psn"
	NintendoEShop  = "nintendo-eshop"
	EAApp          = "ea-app"
	EpicGames      = "epic-games"
	GOG            = "gog-com"
	UbisoftConnect = "ubisoft-connect"
	BattleNet      = "battle-net"

	Global       = "global"
	Europe       = "europe"
	UnitedStates = "united-states"
	Latam        = "latam"
)

// Platforms returns the 9 activation services in display order (decided by the owner).
func Platforms() []Platform {
	return []Platform{
		{Steam, "Steam", 10},
		{XboxLive, "Xbox Live", 20},
		{PSN, "PSN", 30},
		{NintendoEShop, "Nintendo eShop", 40},
		{EAApp, "EA App", 50},
		{EpicGames, "Epic Games", 60},
		{GOG, "GOG.com", 70},
		{UbisoftConnect, "Ubisoft Connect", 80},
		{BattleNet, "Battle.net", 90},
	}
}

// Regions returns the 4 regions in display order (decided by the owner).
func Regions() []Region {
	return []Region{
		{Global, "GLOBAL", 10},
		{Europe, "EUROPE", 20},
		{UnitedStates, "UNITED STATES", 30},
		{Latam, "LATAM", 40},
	}
}

func ratingOf(s string) *string { return &s }

// Sellers returns 8 fictional sellers whose ratings cover every tier of
// docs/DATA_MODEL.md: Superb (>= 9.75), Excellent (>= 9.50), Very good (>= 9.00),
// Good (>= 8.00), no label (< 8.00) and one NULL = "New seller".
func Sellers() []Seller {
	return []Seller{
		{"pixel-harbor", "Pixel Harbor", ratingOf("9.91"), 48210},    // Superb
		{"arcade-owl", "Arcade Owl", ratingOf("9.78"), 15320},        // Superb
		{"keystone-kiosk", "Keystone Kiosk", ratingOf("9.63"), 9875}, // Excellent
		{"byte-bazaar", "Byte Bazaar", ratingOf("9.52"), 4310},       // Excellent
		{"lunar-loot", "Lunar Loot", ratingOf("9.27"), 2140},         // Very good
		{"quest-depot", "Quest Depot", ratingOf("8.46"), 860},        // Good
		{"retro-ridge", "Retro Ridge", ratingOf("7.38"), 212},        // no label
		{"fresh-start-keys", "Fresh Start Keys", nil, 0},             // New seller
	}
}
