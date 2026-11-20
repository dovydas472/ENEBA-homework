-- +goose Up
-- Catalog tables. Design and reasons: docs/DATA_MODEL.md.
-- Only NEW tables -> backward compatible with the deployed code (expand/contract).
--
-- Repeated rules:
--   slug format: lowercase letters/digits in groups separated by single "-" (e.g. "ps5", "the-witcher-3"),
--                so every slug is URL-safe.
--   not blank:   btrim(x) <> '' - NOT NULL alone still allows '' or '   '.

-- Lookup tables instead of Postgres enums (P1): a new platform/region is an INSERT,
-- not a migration, and the display name + sort order live next to the slug.
CREATE TABLE platforms (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug       text    NOT NULL UNIQUE,
    name       text    NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    CONSTRAINT platforms_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT platforms_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE regions (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug       text    NOT NULL UNIQUE,
    name       text    NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    CONSTRAINT regions_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT regions_name_not_blank CHECK (btrim(name) <> '')
);

-- A game is the "title" (The Witcher 3). What is sold is a product (game + platform + region + edition).
CREATE TABLE games (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug         text   NOT NULL UNIQUE,
    title        text   NOT NULL,
    description  text   NOT NULL DEFAULT '',   -- '' = no description (allowed on purpose)
    genres       text[] NOT NULL DEFAULT '{}', -- display only, no genre filter (P6)
    release_date date,                          -- NULL = unknown / not announced
    developer    text,
    publisher    text,
    cover_url    text,                          -- NULL = frontend shows a generated placeholder
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT games_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT games_title_not_blank CHECK (btrim(title) <> '')
);

-- Trigram index for the search box. GIN + gin_trgm_ops on the plain column serves
-- ILIKE '%...%' AND the similarity operators (%, <%), so one index covers both
-- "contains" and typo-tolerant search. pg_trgm lowercases trigrams itself, so no lower().
CREATE INDEX games_title_trgm_idx ON games USING gin (title gin_trgm_ops);

-- The sellable thing: one game on one platform, for one region, in one edition.
-- RESTRICT: a game/platform/region that is still used cannot be deleted by accident.
CREATE TABLE products (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    game_id     bigint NOT NULL REFERENCES games (id)     ON DELETE RESTRICT,
    platform_id bigint NOT NULL REFERENCES platforms (id) ON DELETE RESTRICT,
    region_id   bigint NOT NULL REFERENCES regions (id)   ON DELETE RESTRICT,
    edition     text   NOT NULL DEFAULT 'Standard',
    slug        text   NOT NULL UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT products_edition_not_blank CHECK (btrim(edition) <> ''),
    -- The same variant must not exist twice. Its leading game_id also serves "products of a game".
    CONSTRAINT products_variant_key UNIQUE (game_id, platform_id, region_id, edition)
);

-- Store filters (platform, region). Also used by the FK checks when a platform/region is deleted.
CREATE INDEX products_platform_id_idx ON products (platform_id);
CREATE INDEX products_region_id_idx   ON products (region_id);

CREATE TABLE sellers (
    id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug                  text         NOT NULL UNIQUE,
    name                  text         NOT NULL,
    positive_feedback_pct numeric(4,1),          -- e.g. 99.4; NULL = no rating yet ("New seller")
    reviews_count         integer      NOT NULL DEFAULT 0,
    created_at            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT sellers_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT sellers_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT sellers_feedback_pct_range CHECK (positive_feedback_pct BETWEEN 0 AND 100),
    CONSTRAINT sellers_reviews_count_non_negative CHECK (reviews_count >= 0)
);

-- One seller's price for one product. Money = integer cents (EUR).
CREATE TABLE offers (
    id          bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id  bigint  NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    seller_id   bigint  NOT NULL REFERENCES sellers (id)  ON DELETE RESTRICT,
    price_cents integer NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(), -- kept current by the trigger below
    CONSTRAINT offers_price_positive CHECK (price_cents > 0),
    -- A seller has at most one offer per product (they change the price, not add a second offer).
    CONSTRAINT offers_product_seller_key UNIQUE (product_id, seller_id)
);

-- "Active offers of a product, cheapest first" (product page) and the cheapest price per product
-- (store listing). Partial: inactive offers are never read by the store, so they are not indexed.
CREATE INDEX offers_active_product_price_idx ON offers (product_id, price_cents) WHERE is_active;

-- Sets updated_at on every UPDATE, so no query can forget it. Generic: other tables can reuse it.
-- +goose StatementBegin
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER offers_set_updated_at
    BEFORE UPDATE ON offers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One activation key. Stock is derived from this table (P2), never stored.
CREATE TABLE keys (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    offer_id       bigint NOT NULL REFERENCES offers (id) ON DELETE RESTRICT,
    code           text   NOT NULL,
    status         text   NOT NULL DEFAULT 'available',
    reserved_until timestamptz, -- only while reserved; a past value = expired = available again (P3)
    sold_at        timestamptz, -- only when sold
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT keys_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT keys_status_valid CHECK (status IN ('available', 'reserved', 'sold')),
    -- reserved  <=> reserved_until is set
    CONSTRAINT keys_reserved_until_only_when_reserved CHECK (
        (status = 'reserved' AND reserved_until IS NOT NULL)
        OR (status <> 'reserved' AND reserved_until IS NULL)
    ),
    -- sold <=> sold_at is set
    CONSTRAINT keys_sold_at_only_when_sold CHECK (
        (status = 'sold' AND sold_at IS NOT NULL)
        OR (status <> 'sold' AND sold_at IS NULL)
    ),
    -- The same code cannot be uploaded twice for one offer. Leading offer_id also serves the FK check.
    CONSTRAINT keys_offer_code_key UNIQUE (offer_id, code)
);

-- Keys that can still be sold: "available" AND "reserved" (an expired reservation counts as
-- available, but now() is not allowed in an index predicate, so the expiry is checked in the
-- query using the indexed reserved_until). Sold keys - the bulk over time - are left out,
-- so the index only holds the current stock.
CREATE INDEX keys_unsold_offer_idx ON keys (offer_id, reserved_until) WHERE status <> 'sold';

-- +goose Down
-- Reverse dependency order: children first. Dropping offers also drops its trigger.
DROP TABLE IF EXISTS keys;
DROP TABLE IF EXISTS offers;
DROP FUNCTION IF EXISTS set_updated_at();
DROP TABLE IF EXISTS sellers;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS regions;
DROP TABLE IF EXISTS platforms;
