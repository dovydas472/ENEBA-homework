package homepage

import (
	"context"
	"errors"
	"fmt"
	"log"
	"slices"
	"strconv"
	"strings"

	"github.com/dovydas472/ENEBA-homework/pkg/catalog"
)

// Content is the home page's own data. *Store implements it; unit tests use a fake.
type Content interface {
	Blocks(ctx context.Context) ([]Block, error)
	BlockByKey(ctx context.Context, key string) (Block, error)
	BlockByType(ctx context.Context, blockType string) (Block, error)
	Slides(ctx context.Context) ([]Slide, error)
	Tiles(ctx context.Context) ([]Tile, error)
}

// Catalog is the part of the catalog the blocks reuse: the Store listing (product rows, tile covers,
// platform counts) and the product page (live price of a hero slide). *catalog.Store implements it.
type Catalog interface {
	ListProducts(ctx context.Context, f catalog.Filter) (catalog.Page, error)
	GetProduct(ctx context.Context, slug string) (catalog.ProductDetail, error)
}

// Service builds the response of each block endpoint from the home page tables and the catalog.
// Every method is one block's "service"; they share nothing but the two data sources.
type Service struct {
	content Content
	catalog Catalog
}

// NewService builds a Service.
func NewService(content Content, cat Catalog) *Service {
	return &Service{content: content, catalog: cat}
}

// coversPerTile is how many cover images a tile's collage shows.
const coversPerTile = 3

// MaxDiscountToken in a tile title is replaced with the biggest LIVE discount of the catalog
// (whole percent): "Up to −{maxDiscount}%" -> "Up to −73%". The number follows the catalog
// without anyone editing the tile.
const MaxDiscountToken = "{maxDiscount}"

// Registry is GET /api/homepage: the enabled blocks in order, each with the endpoint of its content,
// plus the preload hint (Task 17, see Preload).
func (s *Service) Registry(ctx context.Context) (Registry, error) {
	blocks, err := s.content.Blocks(ctx)
	if err != nil {
		return Registry{}, err
	}
	out := Registry{Blocks: []RegistryEntry{}}
	hasHero := false
	for _, b := range blocks {
		endpoint, ok := Endpoint(b)
		if !ok {
			// Cannot happen while the CHECK constraint lists the same types; skip rather than break the page.
			log.Printf("homepage: block %q has an unknown type %q - skipped", b.Key, b.Type)
			continue
		}
		out.Blocks = append(out.Blocks, RegistryEntry{Key: b.Key, Type: b.Type, Title: b.Title, Endpoint: endpoint})
		hasHero = hasHero || b.Type == TypeHero
	}
	if hasHero {
		out.Preload.HeroImage = s.firstHeroImage(ctx)
	}
	return out, nil
}

// firstHeroImage is the picture of the first slide the hero block will show, or nil. It is only a hint: if
// it cannot be worked out, the registry is still answered (the hero block reports its own error).
func (s *Service) firstHeroImage(ctx context.Context) *SlideImage {
	slides, err := s.heroSlides(ctx, 1)
	if err != nil {
		log.Printf("homepage: preload hint skipped: %v", err)
		return nil
	}
	if len(slides) == 0 {
		return nil
	}
	return &slides[0].Image
}

// Hero is GET /api/blocks/hero (the slide rules are in heroSlides).
func (s *Service) Hero(ctx context.Context) (Hero, error) {
	if _, err := s.content.BlockByType(ctx, TypeHero); err != nil {
		return Hero{}, err // disabled = 404, like a block that does not exist
	}
	slides, err := s.heroSlides(ctx, 0)
	if err != nil {
		return Hero{}, err
	}
	return Hero{Slides: slides}, nil
}

// heroSlides builds the slides the hero SHOWS, in order; limit > 0 stops after that many (the preload hint
// needs only the first, so it does not look up the prices of the others). The ONE place of the slide rules,
// shared by the hero block and the preload hint, so the hint always names the picture the block will draw:
// a product slide gets the product's LIVE cheapest price and a button to its product page; a product that no
// longer exists or is out of stock drops its slide ("Buy now" for something you cannot buy would be a dead end).
func (s *Service) heroSlides(ctx context.Context, limit int) ([]HeroSlide, error) {
	slides, err := s.content.Slides(ctx)
	if err != nil {
		return nil, err
	}
	out := []HeroSlide{}
	for _, sl := range slides {
		if limit > 0 && len(out) == limit {
			break
		}
		hs := HeroSlide{
			ID: sl.ID, Title: sl.Title, Subtitle: sl.Subtitle, Badge: sl.Badge,
			Image: SlideImage{URL: sl.ImageURL, Srcset: sl.ImageSrcset, MobileURL: sl.ImageURLMobile, MobileSrcset: sl.ImageSrcsetMobile},
		}
		switch {
		case sl.ProductSlug != nil:
			detail, err := s.catalog.GetProduct(ctx, *sl.ProductSlug)
			if errors.Is(err, catalog.ErrNotFound) {
				log.Printf("homepage: slide %d links to unknown product %q - skipped", sl.ID, *sl.ProductSlug)
				continue
			}
			if err != nil {
				return nil, err
			}
			if !detail.Product.InStock || detail.Product.PriceCents == nil {
				continue // out of stock right now: the slide comes back when stock does
			}
			hs.PriceCents = detail.Product.PriceCents
			hs.CTA = &Link{Label: deref(sl.CTALabel), Href: "/product/" + *sl.ProductSlug}
		case sl.CTAHref != nil:
			hs.CTA = &Link{Label: deref(sl.CTALabel), Href: *sl.CTAHref}
		}
		out = append(out, hs)
	}
	return out, nil
}

// Tiles is GET /api/blocks/tiles. A tile with a covers setting gets up to 3 DIFFERENT cover images of
// the matching catalog products (two editions of one game share a cover, so a few extra are asked for).
// {maxDiscount} in a title becomes the live biggest discount (see MaxDiscountToken).
func (s *Service) Tiles(ctx context.Context) (Tiles, error) {
	if _, err := s.content.BlockByType(ctx, TypeTiles); err != nil {
		return Tiles{}, err
	}
	tiles, err := s.content.Tiles(ctx)
	if err != nil {
		return Tiles{}, err
	}
	out := Tiles{Tiles: []TileCard{}}
	var maxDiscount *int64 // nil = not asked yet
	for _, t := range tiles {
		covers, err := ParseCoversConfig(t.Covers)
		if err != nil {
			return Tiles{}, fmt.Errorf("tile %d: %w", t.ID, err)
		}
		title := t.Title
		if strings.Contains(title, MaxDiscountToken) {
			if maxDiscount == nil { // asked once per request, however many tiles use the token
				pct, err := s.maxDiscount(ctx)
				if err != nil {
					return Tiles{}, err
				}
				maxDiscount = &pct
			}
			if *maxDiscount <= 0 {
				// "Up to −0%" would be nonsense: without a discounted product the tile is left out.
				log.Printf("homepage: tile %d needs %s but no product is discounted - skipped", t.ID, MaxDiscountToken)
				continue
			}
			title = strings.ReplaceAll(title, MaxDiscountToken, strconv.FormatInt(*maxDiscount, 10))
		}
		card := TileCard{ID: t.ID, Title: title, Subtitle: t.Subtitle, Href: t.Href, Accent: t.Accent, CoverURLs: []string{}}
		if covers != nil {
			f := catalog.Filter{Sort: covers.Sort, Page: 1, PageSize: 2 * coversPerTile}
			if covers.Platform != "" {
				f.Platforms = []string{covers.Platform}
			}
			page, err := s.catalog.ListProducts(ctx, f)
			if err != nil {
				return Tiles{}, err
			}
			card.CoverURLs = distinctCovers(page.Items, coversPerTile)
		}
		out.Tiles = append(out.Tiles, card)
	}
	return out, nil
}

// Platforms is GET /api/blocks/platforms: "All games" + one entry per platform that has products,
// counted by the SAME facet query as the Store's filter sidebar, so the numbers always agree.
func (s *Service) Platforms(ctx context.Context) (Platforms, error) {
	block, err := s.content.BlockByType(ctx, TypePlatforms)
	if err != nil {
		return Platforms{}, err
	}
	cfg, err := ParsePlatformsConfig(block.Config)
	if err != nil {
		return Platforms{}, err
	}
	// One card is enough: only the total and the platform facet are used.
	page, err := s.catalog.ListProducts(ctx, catalog.Filter{Sort: catalog.SortPopularity, Page: 1, PageSize: 1})
	if err != nil {
		return Platforms{}, err
	}
	out := Platforms{Items: []PlatformLink{{Key: "all", Label: cfg.AllLabel, Count: page.Total, Href: "/store", Icon: cfg.AllIcon}}}
	for _, p := range page.Facets.Platforms {
		out.Items = append(out.Items, PlatformLink{
			Key: p.Slug, Label: p.Name, Count: p.Count, Href: "/store?platform=" + p.Slug, Icon: cfg.IconFor(p.Slug),
		})
	}
	return out, nil
}

// ProductRow is GET /api/blocks/products/{key}: the first `limit` products of the Store listing in the
// block's sort order, and its "View all" link. Only an enabled block of type product_row has one.
func (s *Service) ProductRow(ctx context.Context, key string) (ProductRow, error) {
	block, err := s.content.BlockByKey(ctx, key)
	if err != nil {
		return ProductRow{}, err
	}
	if block.Type != TypeProductRow {
		return ProductRow{}, ErrNotFound
	}
	cfg, err := ParseProductRowConfig(block.Config)
	if err != nil {
		return ProductRow{}, fmt.Errorf("block %q: %w", key, err)
	}
	page, err := s.catalog.ListProducts(ctx, catalog.Filter{Sort: cfg.Sort, Page: 1, PageSize: cfg.Limit})
	if err != nil {
		return ProductRow{}, err
	}
	return ProductRow{Items: page.Items, ViewAllHref: cfg.ViewAllHref}, nil
}

// maxDiscount is the biggest discount (whole percent) of the products that can be bought now, or 0
// when none is discounted. It is the first card of the Store's "discount" listing - the same list the
// tile links to (/store?sort=discount) - so the number on the tile is the one the shopper finds there.
func (s *Service) maxDiscount(ctx context.Context) (int64, error) {
	page, err := s.catalog.ListProducts(ctx, catalog.Filter{Sort: catalog.SortDiscount, Page: 1, PageSize: 1})
	if err != nil {
		return 0, err
	}
	if len(page.Items) == 0 {
		return 0, nil
	}
	first := page.Items[0]
	// The discount sort puts out-of-stock products last, so an out-of-stock first card means none is buyable.
	if !first.InStock || first.DiscountPercent == nil {
		return 0, nil
	}
	return *first.DiscountPercent, nil
}

// distinctCovers returns up to n cover URLs in listing order, without repeats or missing covers.
func distinctCovers(items []catalog.Item, n int) []string {
	out := []string{}
	for _, it := range items {
		if len(out) == n {
			break
		}
		if it.CoverURL != nil && *it.CoverURL != "" && !slices.Contains(out, *it.CoverURL) {
			out = append(out, *it.CoverURL)
		}
	}
	return out
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
