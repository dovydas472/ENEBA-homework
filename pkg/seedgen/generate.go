package seedgen

import (
	"errors"
	"fmt"
	"math/rand/v2"
	"regexp"
	"strconv"
	"time"

	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
)

// The fixed RNG seed. Same seed + same snapshot = exactly the same catalog, on
// every run, on the dev branch and in production. Change it only on purpose.
const (
	rngSeed1 = 2026
	rngSeed2 = 8
)

// Tunable amounts (all deterministic because the RNG is).
const (
	editionGames     = 6     // the 6 most popular games also get a Deluxe / GOTY product
	outOfStockChance = 0.06  // product whose keys are all sold
	inactiveChance   = 0.07  // offer paused by its seller
	soldChance       = 0.10  // a key that was already sold
	reservedChance   = 0.003 // "a couple" of reservations, all already expired
	maxKeysPerOffer  = 8
	fallbackBase     = 2999 // price base when the MSRP is unknown (the MSRP itself stays NULL)
)

// NewRNG returns the generator with the fixed seed. PCG from math/rand/v2 is a
// fully specified algorithm, so the numbers do not depend on the machine.
func NewRNG() *rand.Rand {
	return rand.New(rand.NewPCG(rngSeed1, rngSeed2))
}

// Generate builds the whole catalog from the snapshot. It does not touch the
// database and has no hidden inputs: no time.Now(), no map iteration order, only
// the snapshot and the fixed RNG. All timestamps are derived from the snapshot's
// fetch date, so even they are identical on every run.
func Generate(s igdb.Snapshot) (Catalog, error) {
	fetched, err := time.Parse(time.RFC3339, s.Header.FetchedAt)
	if err != nil {
		return Catalog{}, errors.New("snapshot header.fetched_at is not an RFC 3339 time")
	}
	epoch := fetched.UTC().Truncate(24 * time.Hour) // "today" of the snapshot, 00:00 UTC

	rng := NewRNG()
	c := Catalog{Platforms: Platforms(), Regions: Regions(), Sellers: Sellers()}
	usedGameSlugs := map[string]bool{}
	usedCodes := map[string]bool{}

	for gi, sg := range s.Games {
		game := gameRow(sg, usedGameSlugs)
		c.Games = append(c.Games, game)
		year := 0
		if game.ReleaseDate != nil {
			year = game.ReleaseDate.Year()
		}

		for _, p := range productsFor(game.Slug, sg, gi, year, rng) {
			c.Products = append(c.Products, p)
			outOfStock := rng.Float64() < outOfStockChance
			base := fallbackBase
			if p.MSRPCents != nil {
				base = *p.MSRPCents
			}

			// 2-5 different sellers: a shuffled seller list, take the first n.
			sellers := c.Sellers
			n := 2 + rng.IntN(4)
			for _, si := range rng.Perm(len(sellers))[:n] {
				o := Offer{
					ProductSlug: p.Slug,
					SellerSlug:  sellers[si].Slug,
					PriceCents:  OfferPrice(base, rng),
					IsActive:    rng.Float64() >= inactiveChance,
				}
				c.Offers = append(c.Offers, o)
				c.Keys = append(c.Keys, keysFor(o, outOfStock, epoch, usedCodes, rng)...)
			}
		}
	}
	return c, nil
}

// gameRow converts a snapshot game into a games row.
func gameRow(g igdb.Game, used map[string]bool) Game {
	slug := GameSlug(g.Slug)
	if slug == "" {
		slug = Slugify(g.Name)
	}
	for base, i := slug, 2; used[slug]; i++ { // two games with the same slug: add -2, -3 ...
		slug = base + "-" + strconv.Itoa(i)
	}
	used[slug] = true

	row := Game{
		Slug:        slug,
		Title:       g.Name,
		Description: g.Summary,
		Genres:      append([]string{}, g.Genres...),
		CoverURL:    g.CoverURL(),
		Popularity:  g.TotalRatingCount,
		IGDBID:      g.IGDBID,
	}
	if d, err := time.Parse("2006-01-02", g.ReleaseDate); err == nil {
		row.ReleaseDate = &d
	}
	if len(g.Developers) > 0 {
		row.Developer = &g.Developers[0]
	}
	if len(g.Publishers) > 0 {
		row.Publisher = &g.Publishers[0]
	}
	return row
}

// productsFor makes 1-3 Standard products (platform x region) for one game, plus
// one Deluxe / GOTY product for the most popular games. The first product is
// always the main platform + Global.
func productsFor(gameSlug string, g igdb.Game, gameIndex, year int, rng *rand.Rand) []Product {
	services := PlatformServices(g, rng)
	type variant struct{ platform, region, edition string }
	used := map[variant]bool{}
	var out []Product
	add := func(v variant) {
		used[v] = true
		out = append(out, Product{
			Slug:         ProductSlug(gameSlug, v.edition, v.platform, v.region),
			GameSlug:     gameSlug,
			PlatformSlug: v.platform,
			RegionSlug:   v.region,
			Edition:      v.edition,
			MSRPCents:    MSRPCents(year, v.edition),
		})
	}

	add(variant{services[0], Global, "Standard"})
	want := 1 + rng.IntN(3)
	for attempt := 0; len(out) < want && attempt < 20; attempt++ {
		v := variant{services[rng.IntN(len(services))], PickRegion(rng), "Standard"}
		if !used[v] {
			add(v)
		}
	}
	if gameIndex < editionGames { // the snapshot is sorted by popularity
		add(variant{services[0], Global, EditionFor(year)})
	}
	return out
}

// keysFor makes 0-8 keys for one offer. For an out-of-stock product every key is
// sold (or the offer has none), so no offer of it can be bought.
func keysFor(o Offer, outOfStock bool, epoch time.Time, usedCodes map[string]bool, rng *rand.Rand) []Key {
	count := rng.IntN(maxKeysPerOffer + 1)
	keys := make([]Key, 0, count)
	for i := 0; i < count; i++ {
		code := KeyCode(rng)
		for usedCodes[code] { // practically never happens (36^12 codes), but codes must be unique
			code = KeyCode(rng)
		}
		usedCodes[code] = true

		// Uploaded 30-89 days before the snapshot date.
		created := epoch.AddDate(0, 0, -(30 + rng.IntN(60)))
		k := Key{ProductSlug: o.ProductSlug, SellerSlug: o.SellerSlug, Code: code, Status: StatusAvailable, CreatedAt: created}

		r := rng.Float64()
		switch {
		case outOfStock || r < soldChance:
			// Sold some time between the upload and the snapshot date.
			soldAt := created.Add(time.Duration(1+rng.IntN(int(epoch.Sub(created).Hours())-1)) * time.Hour)
			k.Status, k.SoldAt = StatusSold, &soldAt
		case r < soldChance+reservedChance:
			// A reservation that already EXPIRED (1-72 h before the snapshot date):
			// by the rules of the data model this key is sellable again.
			until := epoch.Add(-time.Duration(1+rng.IntN(72)) * time.Hour)
			k.Status, k.ReservedUntil = StatusReserved, &until
		}
		keys = append(keys, k)
	}
	return keys
}

// Stats are the numbers Validate checks; cmd/seed prints them.
type Stats struct {
	OutOfStockProducts, ZeroKeyOffers, InactiveOffers int
	AvailableKeys, ExpiredReservedKeys, SoldKeys      int
	NewSellers                                        int
}

var (
	slugFormat = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	codeFormat = regexp.MustCompile(`^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`)
)

// Validate checks the catalog BEFORE anything is written: the database rules
// (slug format, uniqueness, positive prices ...) and the promised edge cases
// (out-of-stock products, offers without keys, expired reservations, sold keys,
// a "New seller"). The data is deterministic, so if this passes once for a
// snapshot, it always passes for that snapshot.
func Validate(c Catalog) (Stats, error) {
	var st Stats
	slugs := map[string]bool{}
	for _, s := range c.Games {
		if !slugFormat.MatchString(s.Slug) || slugs["g:"+s.Slug] {
			return st, fmt.Errorf("bad or duplicate game slug %q", s.Slug)
		}
		slugs["g:"+s.Slug] = true
	}
	offersPerProduct := map[string]int{}
	for _, p := range c.Products {
		if !slugFormat.MatchString(p.Slug) || slugs["p:"+p.Slug] {
			return st, fmt.Errorf("bad or duplicate product slug %q", p.Slug)
		}
		slugs["p:"+p.Slug] = true
	}
	for _, s := range c.Sellers {
		if s.Rating == nil {
			st.NewSellers++
		}
	}

	type offerID struct{ product, seller string }
	keyCount := map[offerID]int{}
	sellable := map[offerID]bool{}
	for _, k := range c.Keys {
		if !codeFormat.MatchString(k.Code) {
			return st, fmt.Errorf("bad key code %q", k.Code)
		}
		id := offerID{k.ProductSlug, k.SellerSlug}
		keyCount[id]++
		switch k.Status {
		case StatusSold:
			st.SoldKeys++
		case StatusReserved: // all reservations in the seed are expired = sellable
			st.ExpiredReservedKeys++
			sellable[id] = true
		default:
			st.AvailableKeys++
			sellable[id] = true
		}
	}

	inStock := map[string]bool{}
	for _, o := range c.Offers {
		id := offerID{o.ProductSlug, o.SellerSlug}
		offersPerProduct[o.ProductSlug]++
		if o.PriceCents <= 0 {
			return st, fmt.Errorf("offer %v has a non-positive price", id)
		}
		if keyCount[id] == 0 {
			st.ZeroKeyOffers++
		}
		if !o.IsActive {
			st.InactiveOffers++
		} else if sellable[id] {
			inStock[o.ProductSlug] = true
		}
	}
	for _, p := range c.Products {
		if n := offersPerProduct[p.Slug]; n < 2 || n > 5 {
			return st, fmt.Errorf("product %s has %d offers, want 2-5", p.Slug, n)
		}
		if !inStock[p.Slug] {
			st.OutOfStockProducts++
		}
	}

	switch {
	case st.OutOfStockProducts < 3:
		return st, fmt.Errorf("only %d out-of-stock products, want at least 3", st.OutOfStockProducts)
	case st.ZeroKeyOffers < 1:
		return st, errors.New("no offer without keys")
	case st.InactiveOffers < 1:
		return st, errors.New("no inactive offer")
	case st.ExpiredReservedKeys < 2:
		return st, fmt.Errorf("only %d expired reserved keys, want at least 2", st.ExpiredReservedKeys)
	case st.SoldKeys < 1:
		return st, errors.New("no sold key")
	case st.NewSellers != 1:
		return st, fmt.Errorf("%d sellers without rating, want exactly 1", st.NewSellers)
	}
	return st, nil
}
