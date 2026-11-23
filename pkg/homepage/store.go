package homepage

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dovydas472/ENEBA-homework/pkg/db"
)

// ConnSource hands the Store a database connection (same contract as pkg/catalog and pkg/orders):
// *db.Lazy implements it, with the one cold-start retry.
type ConnSource interface {
	Acquire(ctx context.Context) (*pgxpool.Conn, error)
}

type fixedPool struct{ p *pgxpool.Pool }

func (f fixedPool) Acquire(ctx context.Context) (*pgxpool.Conn, error) { return db.Acquire(ctx, f.p) }

// Store reads the home page's own tables. Only ENABLED rows ever leave it: a disabled block, slide
// or tile is invisible to the rest of the code. Ties in position are broken by id, so the order is stable.
type Store struct{ src ConnSource }

// NewStore builds a Store on a (lazy) connection source.
func NewStore(src ConnSource) *Store { return &Store{src: src} }

// NewStoreFromPool builds a Store on a ready pool (tests).
func NewStoreFromPool(p *pgxpool.Pool) *Store { return &Store{src: fixedPool{p}} }

const blockColumns = `key, type, title, config`

const blocksSQL = `SELECT ` + blockColumns + ` FROM homepage_blocks WHERE enabled ORDER BY position, id`

const blockByKeySQL = `SELECT ` + blockColumns + ` FROM homepage_blocks WHERE enabled AND key = $1`

// A unique index allows only one block of each type except product_row, so this is at most one row.
const blockByTypeSQL = `SELECT ` + blockColumns + ` FROM homepage_blocks WHERE enabled AND type = $1`

const slidesSQL = `
SELECT id, title, subtitle, badge, image_url, image_srcset, image_url_mobile, image_srcset_mobile,
       product_slug, cta_label, cta_href
FROM homepage_slides
WHERE enabled
ORDER BY position, id`

const tilesSQL = `
SELECT id, title, subtitle, href, accent, covers
FROM homepage_tiles
WHERE enabled
ORDER BY position, id`

// Blocks returns the enabled blocks in page order.
func (s *Store) Blocks(ctx context.Context) ([]Block, error) {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()

	rows, err := conn.Query(ctx, blocksSQL)
	if err != nil {
		return nil, fmt.Errorf("homepage: blocks: %w", err)
	}
	out, err := pgx.CollectRows(rows, scanBlock)
	if err != nil {
		return nil, fmt.Errorf("homepage: blocks: %w", err)
	}
	if out == nil {
		out = []Block{}
	}
	return out, nil
}

// BlockByKey returns one enabled block, or ErrNotFound.
func (s *Store) BlockByKey(ctx context.Context, key string) (Block, error) {
	return s.oneBlock(ctx, blockByKeySQL, key)
}

// BlockByType returns the enabled block of a single-instance type (hero, tiles, platforms), or ErrNotFound.
func (s *Store) BlockByType(ctx context.Context, blockType string) (Block, error) {
	return s.oneBlock(ctx, blockByTypeSQL, blockType)
}

func (s *Store) oneBlock(ctx context.Context, sql, arg string) (Block, error) {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return Block{}, err
	}
	defer conn.Release()

	rows, err := conn.Query(ctx, sql, arg)
	if err != nil {
		return Block{}, fmt.Errorf("homepage: block: %w", err)
	}
	b, err := pgx.CollectExactlyOneRow(rows, scanBlock)
	if errors.Is(err, pgx.ErrNoRows) {
		return Block{}, ErrNotFound
	}
	if err != nil {
		return Block{}, fmt.Errorf("homepage: block: %w", err)
	}
	return b, nil
}

func scanBlock(row pgx.CollectableRow) (Block, error) {
	var b Block
	err := row.Scan(&b.Key, &b.Type, &b.Title, &b.Config)
	return b, err
}

// Slides returns the enabled hero slides in order.
func (s *Store) Slides(ctx context.Context) ([]Slide, error) {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()

	rows, err := conn.Query(ctx, slidesSQL)
	if err != nil {
		return nil, fmt.Errorf("homepage: slides: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Slide, error) {
		var sl Slide
		err := row.Scan(&sl.ID, &sl.Title, &sl.Subtitle, &sl.Badge, &sl.ImageURL, &sl.ImageSrcset,
			&sl.ImageURLMobile, &sl.ImageSrcsetMobile, &sl.ProductSlug, &sl.CTALabel, &sl.CTAHref)
		return sl, err
	})
	if err != nil {
		return nil, fmt.Errorf("homepage: slides: %w", err)
	}
	return out, nil
}

// Tiles returns the enabled tiles in order.
func (s *Store) Tiles(ctx context.Context) ([]Tile, error) {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()

	rows, err := conn.Query(ctx, tilesSQL)
	if err != nil {
		return nil, fmt.Errorf("homepage: tiles: %w", err)
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Tile, error) {
		var t Tile
		err := row.Scan(&t.ID, &t.Title, &t.Subtitle, &t.Href, &t.Accent, &t.Covers)
		return t, err
	})
	if err != nil {
		return nil, fmt.Errorf("homepage: tiles: %w", err)
	}
	return out, nil
}
