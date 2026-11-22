-- +goose Up
-- Search aliases (Task 13a): other names of a game that the search must find,
-- e.g. "GTA V" / "GTA 5" for Grand Theft Auto V. Filled by the seed from the IGDB
-- snapshot (alternative_names) plus seed/search_aliases_extra.json. Design and
-- reasons: docs/DATA_MODEL.md.
--
-- Only a NEW table -> backward compatible with the deployed code (expand/contract):
-- the code that is live while this runs never reads it. Until the seed fills it,
-- search simply works on titles only.
--
-- Why a table and not games.aliases text[]: a trigram (GIN gin_trgm_ops) index
-- indexes a text value, not the elements of an array. One row per alias gets the
-- same kind of index as games.title, and "which alias matched" is just that row.
CREATE TABLE game_aliases (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    game_id bigint NOT NULL REFERENCES games (id) ON DELETE RESTRICT,
    alias   text   NOT NULL,
    CONSTRAINT game_aliases_alias_not_blank CHECK (btrim(alias) <> '')
);

-- An alias appears once per game, whatever its case ("GTA V" = "gta v").
-- The leading game_id also serves "aliases of a game" and the FK check when a game is deleted.
CREATE UNIQUE INDEX game_aliases_game_alias_key ON game_aliases (game_id, lower(alias));

-- Same index as games_title_trgm_idx: serves ILIKE '%...%' (contains) AND the
-- word-similarity operator <% (typos), so the alias half of the search is indexed too.
CREATE INDEX game_aliases_alias_trgm_idx ON game_aliases USING gin (alias gin_trgm_ops);

-- +goose Down
DROP TABLE IF EXISTS game_aliases;
