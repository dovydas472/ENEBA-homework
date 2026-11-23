-- +goose Up
-- Home page (Task 15): the block registry and the content of the hero and the side tiles.
-- Design and reasons: docs/DATA_MODEL.md ("Home page tables").
--
-- Backward compatible (expand/contract): three NEW tables, nothing else changes.
-- The code that is live while this runs never reads them.
--
-- The CONTENT rows are inserted here, not by cmd/seed: the catalog seed (and its golden checksum)
-- stays as it is, and production needs no reseed (`seed --reset` refuses once orders exist).
-- No foreign key points into the catalog (product_slug is plain text): each block is a logically
-- separate service, and the catalog reseed deletes and re-inserts products. The API skips a slide
-- whose product does not exist or is out of stock.

-- The registry: which blocks the home page shows, in which order. GET /api/homepage returns the
-- enabled rows ordered by position; the frontend only knows how to DRAW each type.
CREATE TABLE homepage_blocks (
    id       bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Stable name, used in the URL of a product row: /api/blocks/products/{key}.
    key      text    NOT NULL UNIQUE,
    type     text    NOT NULL,
    title    text    NOT NULL,
    position integer NOT NULL,
    enabled  boolean NOT NULL DEFAULT true,
    -- Per-type settings, e.g. a product row's {"sort": "discount", "limit": 5, "viewAllHref": "/store?sort=discount"}.
    -- The Go code validates it (pkg/homepage/config.go); a bad config is a 500, never a silent default.
    config   jsonb   NOT NULL DEFAULT '{}',
    CONSTRAINT homepage_blocks_key_format CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    -- A new type needs new code (an endpoint and a renderer), so it also needs a migration.
    CONSTRAINT homepage_blocks_type_valid CHECK (type IN ('hero', 'tiles', 'platforms', 'product_row')),
    CONSTRAINT homepage_blocks_title_not_blank CHECK (btrim(title) <> ''),
    CONSTRAINT homepage_blocks_config_object CHECK (jsonb_typeof(config) = 'object')
);
-- At most ONE hero, one tiles and one platforms block: their endpoints (/api/blocks/hero ...) have no key.
CREATE UNIQUE INDEX homepage_blocks_one_per_single_type ON homepage_blocks (type) WHERE type <> 'product_row';

-- The hero carousel's slides. A slide either links nowhere (no button), to a product
-- (product_slug: the API adds the live price and links to /product/{slug}) or to a page (cta_href).
CREATE TABLE homepage_slides (
    id                  bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    position            integer NOT NULL,
    enabled             boolean NOT NULL DEFAULT true,
    title               text    NOT NULL,
    subtitle            text,
    badge               text,
    -- image_url is the fallback src; *_srcset lists the same picture in several widths ("url 1280w, url 1920w")
    -- so the browser downloads the smallest file that is sharp enough. The mobile pair is used <= 600px.
    image_url           text    NOT NULL,
    image_srcset        text,
    image_url_mobile    text    NOT NULL,
    image_srcset_mobile text,
    product_slug        text,
    cta_label           text,
    cta_href            text,
    CONSTRAINT homepage_slides_title_not_blank CHECK (btrim(title) <> ''),
    -- Our own files (/banners/...) or https only.
    CONSTRAINT homepage_slides_image_url_valid CHECK (image_url ~ '^(/[^/]|https://)' AND image_url_mobile ~ '^(/[^/]|https://)'),
    -- Internal links only ("/store", not "//evil.example" or "javascript:").
    CONSTRAINT homepage_slides_cta_href_internal CHECK (cta_href ~ '^/([^/]|$)'),
    -- A product slide links to its product page, so it cannot have its own href as well.
    CONSTRAINT homepage_slides_one_target CHECK (product_slug IS NULL OR cta_href IS NULL),
    -- A button needs a label AND a target; no target = no button (no dead links).
    CONSTRAINT homepage_slides_label_iff_target CHECK ((cta_label IS NOT NULL) = (product_slug IS NOT NULL OR cta_href IS NOT NULL))
);

-- The small tiles next to the hero. covers (optional) = which catalog products give the 2-3 cover
-- images of the collage, e.g. {"sort": "discount"} or {"sort": "popularity", "platform": "steam"}.
-- Without it the tile is only text on its gradient.
CREATE TABLE homepage_tiles (
    id       bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    position integer NOT NULL,
    enabled  boolean NOT NULL DEFAULT true,
    title    text    NOT NULL,
    subtitle text,
    href     text    NOT NULL,
    -- Which token gradient the frontend paints (--tile-gradient-violet / -promo / -mint), not a colour value.
    accent   text    NOT NULL DEFAULT 'violet',
    covers   jsonb,
    CONSTRAINT homepage_tiles_title_not_blank CHECK (btrim(title) <> ''),
    CONSTRAINT homepage_tiles_href_internal CHECK (href ~ '^/([^/]|$)'),
    CONSTRAINT homepage_tiles_accent_valid CHECK (accent IN ('violet', 'promo', 'mint')),
    CONSTRAINT homepage_tiles_covers_object CHECK (covers IS NULL OR jsonb_typeof(covers) = 'object')
);

-- ---------------------------------------------------------------------------------------------
-- Content. Positions go in steps of 10, so a block can later be put between two others with an UPDATE.
-- ---------------------------------------------------------------------------------------------

INSERT INTO homepage_blocks (key, type, title, position, config) VALUES
    ('hero', 'hero', 'Featured', 10, '{}'),
    ('tiles', 'tiles', 'Shortcuts', 20, '{}'),
    -- Generic lucide icon names (no brand logos). The frontend draws only names it knows.
    ('platforms', 'platforms', 'Browse by platform', 30, '{
        "allLabel": "All games",
        "allIcon": "layout-grid",
        "defaultIcon": "gamepad-2",
        "icons": {
            "steam": "monitor", "ea-app": "monitor", "epic-games": "monitor", "gog-com": "monitor", "ubisoft-connect": "monitor",
            "psn": "gamepad-2", "xbox-live": "gamepad-2", "nintendo-eshop": "gamepad"
        }
    }'),
    ('popular', 'product_row', 'Popular right now', 40, '{"sort": "popularity", "limit": 5, "viewAllHref": "/store"}'),
    ('discounts', 'product_row', 'Biggest discounts', 50, '{"sort": "discount", "limit": 5, "viewAllHref": "/store?sort=discount"}'),
    ('new-releases', 'product_row', 'New releases', 60, '{"sort": "newest", "limit": 5, "viewAllHref": "/store?sort=newest"}');

-- Slide 1: Innert, a friend's game in development (art used with the author's permission). No button:
-- its repository is private, so there is nothing to link to. The WebP files are in public/banners/.
-- Slides 2-3: IGDB artworks of the two most popular in-stock games (image ids fetched once, locally).
INSERT INTO homepage_slides (position, title, subtitle, badge, image_url, image_srcset, image_url_mobile, image_srcset_mobile, product_slug, cta_label) VALUES
    (10, 'INNERT', 'Realms · Raids · Dragons', 'Coming soon',
     '/banners/innert-hero-1920.webp',
     '/banners/innert-hero-1280.webp 1280w, /banners/innert-hero-1920.webp 1920w, /banners/innert-hero-2560.webp 2560w',
     '/banners/innert-mobile-1080.webp',
     '/banners/innert-mobile-768.webp 768w, /banners/innert-mobile-1080.webp 1080w',
     NULL, NULL),
    (20, 'Grand Theft Auto V', 'Steam key · Global', NULL,
     'https://images.igdb.com/igdb/image/upload/t_1080p/ar6d9m.jpg',
     'https://images.igdb.com/igdb/image/upload/t_720p/ar6d9m.jpg 1280w, https://images.igdb.com/igdb/image/upload/t_1080p/ar6d9m.jpg 1920w',
     'https://images.igdb.com/igdb/image/upload/t_720p/ar6d9m.jpg',
     'https://images.igdb.com/igdb/image/upload/t_screenshot_big/ar6d9m.jpg 889w, https://images.igdb.com/igdb/image/upload/t_720p/ar6d9m.jpg 1280w',
     'grand-theft-auto-v-steam-global', 'Buy now'),
    -- This artwork is 7133 x 4463 (not 16:9): IGDB's 720p / 1080p sizes keep the ratio, so they are 1151 / 1726 px wide.
    (30, 'The Witcher 3: Wild Hunt', 'Steam key · Global', NULL,
     'https://images.igdb.com/igdb/image/upload/t_1080p/ar3lze.jpg',
     'https://images.igdb.com/igdb/image/upload/t_720p/ar3lze.jpg 1151w, https://images.igdb.com/igdb/image/upload/t_1080p/ar3lze.jpg 1726w',
     'https://images.igdb.com/igdb/image/upload/t_720p/ar3lze.jpg',
     'https://images.igdb.com/igdb/image/upload/t_screenshot_big/ar3lze.jpg 889w, https://images.igdb.com/igdb/image/upload/t_720p/ar3lze.jpg 1151w',
     'the-witcher-3-wild-hunt-steam-global', 'Buy now');

-- Our own tiles: text on a token gradient + covers from the catalog (no Eneba artwork).
INSERT INTO homepage_tiles (position, title, subtitle, href, accent, covers) VALUES
    (10, 'Up to −70%', 'The biggest discounts', '/store?sort=discount', 'promo', '{"sort": "discount"}'),
    (20, 'Steam games', 'Keys for your Steam library', '/store?platform=steam', 'violet', '{"sort": "popularity", "platform": "steam"}'),
    (30, 'New releases', 'The latest games', '/store?sort=newest', 'mint', '{"sort": "newest"}');

-- +goose Down
DROP TABLE IF EXISTS homepage_tiles;
DROP TABLE IF EXISTS homepage_slides;
DROP TABLE IF EXISTS homepage_blocks;
