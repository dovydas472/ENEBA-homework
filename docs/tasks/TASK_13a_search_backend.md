# Task 13a – Search backend: IGDB aliases, typo-tolerant `q`, suggestions endpoint

**Model:** Opus · **Effort:** high
Runs **in parallel with Task 13b** (search UI), which works in a separate worktree against the API contract below. Merge 13a first.

## Goal
Search is one of the two "deep" parts. Visitors must find games by partial names, with typos and with common abbreviations ("gta", "rdr2").

## Decisions (made by the owner – do not change)
- Q1. **Aliases from IGDB `alternative_names`.** Fetch them for the **existing 50 games only** – the catalog itself must not change (no new games, no changed popularity/covers/summaries).
- Q3. When `q` is set, the default sort is **`relevance`** ("Best match": match quality, ties by popularity). Filters and facet counts work together with `q`.
- Q4. Search scope: game **title + aliases** only (not developer/publisher/genre).
- `q`: trimmed; length **2–100** characters, otherwise `400` with a clear message. Never string-built SQL.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/13a-search-backend`).

## 2. Aliases data
- `cmd/igdb-snapshot`: add a mode (e.g. `--aliases-only`) that reads the committed `seed/igdb_snapshot.json`, queries IGDB `alternative_names` for those 50 `igdb_id`s, and writes them into the snapshot **without changing any other field** (verify with a diff: only the new alias field changes). You run it locally – the IGDB credentials are in the owner's `.env` and never leave it.
- Keep only useful aliases: Latin-script, deduplicated case-insensitively, not equal to the title, max ~10 per game.
- If an obvious abbreviation is missing for a top game (e.g. "GTA 5"), you may add it in a small committed file `seed/search_aliases_extra.json` with a one-line reason per entry. Keep it short; list it in the report.
- Migration `00003` (via `cmd/migrate create`): add what the search needs (e.g. `games.aliases text[] NOT NULL DEFAULT '{}'` and an indexed search text / a separate terms table – choose, explain). Backward compatible. Update `docs/DATA_MODEL.md`.
- `pkg/seedgen` / `cmd/seed`: fill the aliases. The seed stays deterministic; **the checksum changes** – record the new value in the report and in `CLAUDE.md`/README where the old one is mentioned.

## 3. Matching and ranking (`pkg/catalog`)
- A game matches if its title or an alias **contains** the query (case-insensitive, partial) **or** is similar enough with `pg_trgm` (e.g. `word_similarity`/`%>` – choose operator and threshold, explain).
- Ranking for `sort=relevance`: exact title (or alias) match > title prefix > contains > trigram similarity score > popularity. Deterministic tie-break.
- Tune the threshold with a **table of real queries against our 50 games** (pick ones that exist in the snapshot), e.g. `witcher`, `witchr 3`, `the witcher`, `gta`, `gta 5`, `elden`, `eldn ring`, `cyberpnk`, `rdr2`, `portal`, one 2-letter query, and nonsense like `qwertyzz` (→ nothing). Put this table in the report: query → top 3 results.
- Check `EXPLAIN` uses the trigram index for the match.

## 4. API contract (13b builds against exactly this)
- `GET /api/products?q=…` – existing params unchanged; `q` filters items **and facets**; new sort value `relevance` (allowed always; without `q` it behaves like `popularity`). Default sort = `relevance` when `q` is set, else `popularity`.
- `GET /api/search/suggest?q=…` → `{ "items": [ … up to 6 … ] }`, one item **per game**:
  `{ gameTitle, productSlug, platform {slug,name}, region {slug,name}, coverUrl, priceCents|null, inStock, matchedAlias|null }`
  `productSlug` = the game's cheapest in-stock product (if none in stock: its most popular product, `inStock=false`, `priceCents=null`). Ordered by relevance. `matchedAlias` = the alias that matched when the title did not (so the UI can show "GTA V" → Grand Theft Auto V).
  `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`; errors `no-store`; 400/500/503 rules as before.
- Update `src/api/types.ts` and `src/api/catalog.ts` (`getSuggestions(q)`) – types only, no UI.

## 5. Tests
- Unit: `q` validation (length, trimming), sort default with/without `q`.
- Integration (CI, deterministic seed): the query table from §3 as assertions (top result per query); facets with `q`; `q` + platform filter; suggest returns ≤ 6, one per game, `matchedAlias` set for an alias hit; nonsense → empty.

## 6. Owner manual steps (list them exactly in the report)
After merge: Actions → Migrate production runs automatically → then **Actions → Seed production → Run workflow with `reset` ticked** (`confirm` = `seed-production`) so production gets the aliases; check the new checksum in the log.

## 7. Docs
`docs/PAAISKINIMAI_LT.md`: trigram similarity and `word_similarity` vs `ILIKE`; why aliases (abbreviations are not typos); ranking order; threshold tuning with the query table; why suggestions are one per game; why the catalog must not change when refreshing aliases.

## Report
As defined in `CLAUDE.md` (incl. Self-review). Export the session log at the end and commit it on this branch.
