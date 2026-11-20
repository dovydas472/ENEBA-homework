package seedgen

import (
	"math/rand/v2"
	"regexp"
	"slices"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
)

func testRNG() *rand.Rand { return rand.New(rand.NewPCG(1, 2)) }

func TestSlugify(t *testing.T) {
	tests := map[string]string{
		"god-of-war--1":                  "god-of-war-1",
		"The Witcher 3: Wild Hunt":       "the-witcher-3-wild-hunt",
		"  --Half-Life 2--  ":            "half-life-2",
		"Pokémon Legends":                "pok-mon-legends",
		"Game of the Year Edition":       "game-of-the-year-edition",
		"Tom Clancy's Rainbow Six Siege": "tom-clancy-s-rainbow-six-siege",
	}
	for in, want := range tests {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPCStore(t *testing.T) {
	tests := []struct {
		name       string
		publishers []string
		developers []string
		want       string
	}{
		{"EA publisher -> EA App", []string{"Electronic Arts"}, nil, EAApp},
		{"Ubisoft publisher -> Ubisoft Connect", []string{"Ubisoft Entertainment"}, nil, UbisoftConnect},
		{"Blizzard developer -> Battle.net", []string{"Activision"}, []string{"Blizzard Entertainment"}, BattleNet},
		{"anyone else -> Steam", []string{"Valve"}, []string{"Valve"}, Steam},
		{"no companies -> Steam", nil, nil, Steam},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			g := igdb.Game{Publishers: tc.publishers, Developers: tc.developers}
			if got := PCStore(g); got != tc.want {
				t.Fatalf("PCStore() = %s, want %s", got, tc.want)
			}
		})
	}
}

func TestPlatformServices(t *testing.T) {
	// Consoles map 1:1, the PC store comes first.
	g := igdb.Game{Platforms: []int{igdb.PlatformPS5, igdb.PlatformXboxSeries, igdb.PlatformSwitch, igdb.PlatformPC},
		Publishers: []string{"Electronic Arts"}}
	got := PlatformServices(g, testRNG())
	want := []string{EAApp, PSN, XboxLive, NintendoEShop}
	if !slices.Equal(got, want) {
		t.Fatalf("PlatformServices() = %v, want %v", got, want)
	}

	// Console only: no PC store.
	got = PlatformServices(igdb.Game{Platforms: []int{igdb.PlatformPS4}}, testRNG())
	if !slices.Equal(got, []string{PSN}) {
		t.Fatalf("PS4 only: got %v", got)
	}

	// CD Projekt on PC always gets GOG.com next to Steam.
	got = PlatformServices(igdb.Game{Platforms: []int{igdb.PlatformPC}, Developers: []string{"CD Projekt RED"}}, testRNG())
	if got[0] != Steam || !slices.Contains(got, GOG) {
		t.Fatalf("CD Projekt: got %v", got)
	}

	// Over many games, GOG / Epic are only ever added to Steam games, and sometimes.
	rng := testRNG()
	extras := 0
	for i := 0; i < 200; i++ {
		s := PlatformServices(igdb.Game{Platforms: []int{igdb.PlatformPC}}, rng)
		if s[0] != Steam {
			t.Fatalf("first service should be Steam, got %v", s)
		}
		extras += len(s) - 1
	}
	if extras == 0 || extras > 150 {
		t.Fatalf("unexpected number of GOG/Epic extras: %d of 200", extras)
	}
	ubi := PlatformServices(igdb.Game{Platforms: []int{igdb.PlatformPC}, Publishers: []string{"Ubisoft"}}, testRNG())
	if !slices.Equal(ubi, []string{UbisoftConnect}) {
		t.Fatalf("Ubisoft game must not get GOG/Epic extras: %v", ubi)
	}
}

func TestMSRPCents(t *testing.T) {
	tests := []struct {
		year    int
		edition string
		want    int
	}{
		{2023, "Standard", 6999},
		{2022, "Standard", 6999},
		{2020, "Standard", 5999},
		{2018, "Standard", 5999},
		{2015, "Standard", 3999},
		{2011, "Standard", 2999},
		{2004, "Standard", 1999},
		{2022, "Deluxe Edition", 8999},
		{2015, "Game of the Year Edition", 5999},
	}
	for _, tc := range tests {
		got := MSRPCents(tc.year, tc.edition)
		if got == nil || *got != tc.want {
			t.Errorf("MSRPCents(%d, %q) = %v, want %d", tc.year, tc.edition, got, tc.want)
		}
	}
	if MSRPCents(0, "Standard") != nil {
		t.Error("unknown year must give nil (no discount badge)")
	}
}

func TestEditionFor(t *testing.T) {
	if EditionFor(2015) != "Game of the Year Edition" || EditionFor(2022) != "Deluxe Edition" || EditionFor(0) != "Deluxe Edition" {
		t.Fatal("unexpected edition names")
	}
}

func TestProductSlug(t *testing.T) {
	if got := ProductSlug("elden-ring", "Standard", Steam, Global); got != "elden-ring-steam-global" {
		t.Fatalf("got %s", got)
	}
	if got := ProductSlug("elden-ring", "Deluxe Edition", PSN, UnitedStates); got != "elden-ring-deluxe-edition-psn-united-states" {
		t.Fatalf("got %s", got)
	}
}

func TestRoundPrice(t *testing.T) {
	tests := map[int]int{
		1873: 1849, // nearest .49
		1880: 1899, // nearest .99
		1720: 1699, // .99 of the euro below
		1749: 1749, // already fine
		10:   99,   // never below 0.99
		150:  149,
	}
	for in, want := range tests {
		if got := RoundPrice(in); got != want {
			t.Errorf("RoundPrice(%d) = %d, want %d", in, got, want)
		}
	}
}

func TestOfferPriceRange(t *testing.T) {
	rng := testRNG()
	for i := 0; i < 1000; i++ {
		p := OfferPrice(5999, rng)
		// 25-90 % of 59.99 is 14.99 .. 53.99; rounding moves it by at most 0.50.
		if p < 1449 || p > 5449 {
			t.Fatalf("price %d outside 25-90 %% of 5999", p)
		}
		if c := p % 100; c != 49 && c != 99 {
			t.Fatalf("price %d does not end in .49 or .99", p)
		}
	}
}

func TestKeyCode(t *testing.T) {
	format := regexp.MustCompile(`^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`)
	a, b := KeyCode(testRNG()), KeyCode(testRNG())
	if !format.MatchString(a) {
		t.Fatalf("bad format: %s", a)
	}
	if a != b {
		t.Fatalf("same seed must give the same code: %s vs %s", a, b)
	}
}

func TestSellersCoverAllTiers(t *testing.T) {
	s := Sellers()
	if len(s) != 8 {
		t.Fatalf("want 8 sellers, got %d", len(s))
	}
	tiers := map[string]bool{}
	for _, x := range s {
		switch {
		case x.Rating == nil:
			tiers["new"] = true
		case *x.Rating >= "9.75":
			tiers["superb"] = true
		case *x.Rating >= "9.50":
			tiers["excellent"] = true
		case *x.Rating >= "9.00":
			tiers["very good"] = true
		case *x.Rating >= "8.00":
			tiers["good"] = true
		default:
			tiers["none"] = true
		}
	}
	if len(tiers) != 6 {
		t.Fatalf("sellers do not cover all 6 tiers: %v", tiers)
	}
}
