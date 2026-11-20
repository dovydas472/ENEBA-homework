-- +goose Up
-- pg_trgm: fuzzy / "contains" text search (used later for game search).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- citext: case-insensitive text type (used later for e-mails and similar fields).
CREATE EXTENSION IF NOT EXISTS citext;

-- +goose Down
DROP EXTENSION IF EXISTS citext;
DROP EXTENSION IF EXISTS pg_trgm;
