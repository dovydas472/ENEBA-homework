package seedgen

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/dovydas472/ENEBA-homework/pkg/igdb"
)

// fakeSnapshot builds n games with a mix of platforms and release years.
func fakeSnapshot(n int) igdb.Snapshot {
	platformSets := [][]int{
		{igdb.PlatformPC},
		{igdb.PlatformPC, igdb.PlatformPS5, igdb.PlatformXboxSeries},
		{igdb.PlatformSwitch},
		{igdb.PlatformPS4},
		{igdb.PlatformPC, igdb.PlatformXboxOne},
	}
	s := igdb.Snapshot{Header: igdb.Header{Source: "IGDB", FetchedAt: "2026-11-20T10:00:00Z"}}
	for i := 0; i < n; i++ {
		s.Games = append(s.Games, igdb.Game{
			IGDBID:           int64(1000 + i),
			Name:             fmt.Sprintf("Game %d", i),
			Slug:             fmt.Sprintf("game-%d", i),
			Summary:          "A game.",
			Genres:           []string{"Adventure"},
			ReleaseDate:      fmt.Sprintf("%d-06-01", 2004+i%22),
			Publishers:       []string{"Some Publisher"},
			CoverImageID:     fmt.Sprintf("co%d", i),
			TotalRatingCount: 5000 - i,
			Platforms:        platformSets[i%len(platformSets)],
		})
	}
	return s
}

func TestGenerateIsDeterministic(t *testing.T) {
	a, err := Generate(fakeSnapshot(50), nil)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := Generate(fakeSnapshot(50), nil)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("two runs with the same snapshot produced different catalogs")
	}
}

func TestGenerateShape(t *testing.T) {
	c, err := Generate(fakeSnapshot(50), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Validate(c); err != nil {
		t.Fatalf("Validate: %v", err)
	}

	perGame := map[string]int{}
	editions := 0
	for _, p := range c.Products {
		if p.Edition == "Standard" {
			perGame[p.GameSlug]++
		} else {
			editions++
		}
	}
	for g, n := range perGame {
		if n < 1 || n > 3 {
			t.Errorf("game %s has %d standard products, want 1-3", g, n)
		}
	}
	if len(perGame) != 50 {
		t.Errorf("every game needs a product, got %d games with products", len(perGame))
	}
	if editions != editionGames {
		t.Errorf("want %d edition products, got %d", editionGames, editions)
	}

	keysPerOffer := map[[2]string]int{}
	for _, k := range c.Keys {
		keysPerOffer[[2]string{k.ProductSlug, k.SellerSlug}]++
	}
	for o, n := range keysPerOffer {
		if n > maxKeysPerOffer {
			t.Errorf("offer %v has %d keys", o, n)
		}
	}
}

func TestGenerateTimestampsComeFromTheSnapshot(t *testing.T) {
	c, _ := Generate(fakeSnapshot(50), nil)
	epochEnd := "2026-11-20"
	for _, k := range c.Keys {
		if k.CreatedAt.Format("2006-01-02") >= epochEnd {
			t.Fatalf("key created on/after the snapshot date: %v", k.CreatedAt)
		}
		if k.ReservedUntil != nil && k.ReservedUntil.Format("2006-01-02") > epochEnd {
			t.Fatalf("reservation not expired: %v", k.ReservedUntil)
		}
		if k.SoldAt != nil && (k.SoldAt.Before(k.CreatedAt) || k.SoldAt.Format("2006-01-02") > epochEnd) {
			t.Fatalf("sold_at outside [created_at, snapshot date]: %v", k.SoldAt)
		}
	}
}

func TestValidateRejectsBrokenData(t *testing.T) {
	c, _ := Generate(fakeSnapshot(50), nil)
	c.Products[0].Slug = "Bad Slug"
	if _, err := Validate(c); err == nil {
		t.Fatal("expected an error for a bad slug")
	}
}

func TestGenerateRejectsBadFetchDate(t *testing.T) {
	s := fakeSnapshot(1)
	s.Header.FetchedAt = "yesterday"
	if _, err := Generate(s, nil); err == nil {
		t.Fatal("expected an error")
	}
}
