package seedgen

import (
	"math/rand/v2"
	"regexp"
	"strings"

	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
)

// The generation rules. Each one is a small function with its own unit test.
// Rules that need randomness take the *rand.Rand, so a test (and the seed) can
// pass a generator with a fixed seed and always get the same answer.

var (
	notSlugChars = regexp.MustCompile(`[^a-z0-9]+`)
	igdbSuffix   = regexp.MustCompile(`--\d+$`)
)

// GameSlug turns an IGDB slug into ours. IGDB makes slugs unique with a "--N"
// suffix ("god-of-war--1" = the 2018 game); we drop it ("god-of-war") because our
// catalog has only one game with that name (gameRow adds "-2" if two collide).
func GameSlug(igdbSlug string) string {
	return Slugify(igdbSuffix.ReplaceAllString(igdbSlug, ""))
}

// Slugify makes a URL-safe slug that matches the CHECK in the database
// (^[a-z0-9]+(-[a-z0-9]+)*$): lowercase, every other character run becomes one "-".
// Used for game names, editions and IGDB slugs.
func Slugify(s string) string {
	return strings.Trim(notSlugChars.ReplaceAllString(strings.ToLower(s), "-"), "-")
}

// hasCompany reports whether any of the names contains the word (case-insensitive),
// e.g. "Electronic Arts" in "Electronic Arts Inc.".
func hasCompany(names []string, word string) bool {
	for _, n := range names {
		if strings.Contains(strings.ToLower(n), strings.ToLower(word)) {
			return true
		}
	}
	return false
}

// PCStore picks the main PC activation service from the publisher:
// EA -> EA App, Ubisoft -> Ubisoft Connect, Blizzard -> Battle.net, otherwise Steam.
// Valve's own games are always Steam (Steam is Valve's store), even when IGDB also
// lists EA as a publisher (EA published the retail boxes of Portal / Portal 2).
func PCStore(g igdb.Game) string {
	switch {
	case hasCompany(g.Publishers, "Valve") || hasCompany(g.Developers, "Valve"):
		return Steam
	case hasCompany(g.Publishers, "Electronic Arts"):
		return EAApp
	case hasCompany(g.Publishers, "Ubisoft"):
		return UbisoftConnect
	case hasCompany(g.Publishers, "Blizzard") || hasCompany(g.Developers, "Blizzard"):
		return BattleNet
	default:
		return Steam
	}
}

// PlatformServices maps a game's IGDB platforms to activation services, main one first:
//
//	PC          -> PCStore (Steam / EA App / Ubisoft Connect / Battle.net);
//	               Steam games may additionally get GOG.com (always for CD Projekt) and Epic Games
//	PS4 / PS5   -> PSN
//	Xbox        -> Xbox Live
//	Switch (2)  -> Nintendo eShop
func PlatformServices(g igdb.Game, rng *rand.Rand) []string {
	has := map[int]bool{}
	for _, p := range g.Platforms {
		has[p] = true
	}
	var out []string
	if has[igdb.PlatformPC] {
		store := PCStore(g)
		out = append(out, store)
		if store == Steam {
			cdProjekt := hasCompany(g.Publishers, "CD Projekt") || hasCompany(g.Developers, "CD Projekt")
			if cdProjekt || rng.Float64() < 0.20 {
				out = append(out, GOG)
			}
			if rng.Float64() < 0.15 {
				out = append(out, EpicGames)
			}
		}
	}
	if has[igdb.PlatformPS4] || has[igdb.PlatformPS5] {
		out = append(out, PSN)
	}
	if has[igdb.PlatformXboxOne] || has[igdb.PlatformXboxSeries] {
		out = append(out, XboxLive)
	}
	if has[igdb.PlatformSwitch] || has[igdb.PlatformSwitch2] {
		out = append(out, NintendoEShop)
	}
	return out
}

// PickRegion returns a region for an extra product: Global 40 %, Europe 30 %,
// United States 15 %, LATAM 15 %. (Every game's first product is always Global.)
func PickRegion(rng *rand.Rand) string {
	switch r := rng.IntN(100); {
	case r < 40:
		return Global
	case r < 70:
		return Europe
	case r < 85:
		return UnitedStates
	default:
		return Latam
	}
}

// PickPlatform chooses the platform of an extra product. Platforms the game has
// no product on yet are preferred, so multi-platform games show up under more
// platform filters (otherwise most extras would be one more Steam product).
func PickPlatform(services []string, used map[string]bool, rng *rand.Rand) string {
	var unused []string
	for _, s := range services {
		if !used[s] {
			unused = append(unused, s)
		}
	}
	if len(unused) > 0 {
		return unused[rng.IntN(len(unused))]
	}
	return services[rng.IntN(len(services))]
}

// EditionFor names the extra edition of a popular game: older games (<= 2017) get
// a "Game of the Year Edition", newer ones a "Deluxe Edition".
func EditionFor(releaseYear int) string {
	if releaseYear != 0 && releaseYear <= 2017 {
		return "Game of the Year Edition"
	}
	return "Deluxe Edition"
}

// ProductSlug builds e.g. "elden-ring-steam-global" or
// "elden-ring-deluxe-edition-steam-global" (the Standard edition is not in the slug).
func ProductSlug(gameSlug, edition, platformSlug, regionSlug string) string {
	parts := []string{gameSlug}
	if edition != "Standard" {
		parts = append(parts, Slugify(edition))
	}
	parts = append(parts, platformSlug, regionSlug)
	return strings.Join(parts, "-")
}

// MSRPCents returns the list price in cents from the release year:
// 2022+ 69.99, 2018-2021 59.99, 2014-2017 39.99, 2010-2013 29.99, older 19.99;
// a Deluxe / GOTY edition costs 20.00 more. Unknown year -> nil (no discount badge).
func MSRPCents(releaseYear int, edition string) *int {
	if releaseYear == 0 {
		return nil
	}
	var cents int
	switch {
	case releaseYear >= 2022:
		cents = 6999
	case releaseYear >= 2018:
		cents = 5999
	case releaseYear >= 2014:
		cents = 3999
	case releaseYear >= 2010:
		cents = 2999
	default:
		cents = 1999
	}
	if edition != "Standard" {
		cents += 2000
	}
	return &cents
}

// RoundPrice moves a price to the nearest "x.49" or "x.99" (shop-style prices),
// never below 0.99. All in integer cents: 1873 -> 1849, 1880 -> 1899, 1720 -> 1699.
func RoundPrice(cents int) int {
	euros := cents / 100
	best := 99 // 0.99 is the minimum
	for _, c := range []int{(euros-1)*100 + 99, euros*100 + 49, euros*100 + 99} {
		if c >= 99 && abs(c-cents) < abs(best-cents) {
			best = c
		}
	}
	return best
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// OfferPrice is a seller's price: 25-90 % of the list price, rounded by RoundPrice.
// Rounding can move a price just outside the range (25 % of 19.99 = 4.99 is 24.96 %),
// so it is then moved one step (0.50: x.49 <-> x.99) back inside.
func OfferPrice(msrpCents int, rng *rand.Rand) int {
	percent := 25 + rng.IntN(66) // 25..90
	price := RoundPrice(msrpCents * percent / 100)
	minPrice := (msrpCents*25 + 99) / 100 // 25 %, rounded up
	maxPrice := msrpCents * 90 / 100      // 90 %, rounded down
	if price < minPrice {
		price += 50
	}
	if price > maxPrice {
		price -= 50
	}
	return price
}

const codeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// KeyCode makes an obviously fake code "DEMO-XXXX-XXXX-XXXX" (A-Z, 0-9). The DEMO-
// prefix makes it impossible to mistake for a real key (or to resell one).
func KeyCode(rng *rand.Rand) string {
	var b strings.Builder
	b.WriteString("DEMO")
	for group := 0; group < 3; group++ {
		b.WriteByte('-')
		for i := 0; i < 4; i++ {
			b.WriteByte(codeAlphabet[rng.IntN(len(codeAlphabet))])
		}
	}
	return b.String()
}
