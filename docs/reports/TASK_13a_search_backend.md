# Task 13a – Search backend: IGDB aliases, typo-tolerant `q`, suggestions endpoint

Task file: [`docs/tasks/TASK_13a_search_backend.md`](../tasks/TASK_13a_search_backend.md) · Branch: `task/13a-search-backend`

Visitors can now find games by partial names, typos and abbreviations: `GET /api/products?q=…` filters items **and**
facets, sorted by "Best match" by default, and `GET /api/search/suggest?q=…` returns up to 6 games for the search box.
Aliases ("GTA 5", "RDR2") come from IGDB `alternative_names` for the existing 50 games; the catalog itself is unchanged.

## 1. Files changed

**Data and seed**
- `pkg/igdb/aliases.go` (+ `aliases_test.go`) – `AliasesQuery`, `GroupAliases`, `CleanAliases` (Latin script, no `.exe` names, not the title, case-insensitive dedupe, max 10).
- `pkg/igdb/snapshot.go` – new field `Game.Aliases` (`"aliases"` in the JSON).
- `cmd/igdb-snapshot/main.go` – new `--aliases-only` mode; a full refresh fetches aliases too.
- `seed/igdb_snapshot.json` – **only** the `aliases` fields added (131 aliases for 50 games).
- `seed/search_aliases_extra.json` (new) – 3 hand-written aliases with a reason each; `seed/embed.go` embeds it.
- `migrations/00003_search_aliases.sql` (new, created with `go run ./cmd/migrate create search_aliases`) – table `game_aliases` + unique index `(game_id, lower(alias))` + GIN trigram index.
- `pkg/seedgen/aliases.go` (+ `aliases_test.go`) – parse the extras file, merge with the snapshot aliases (an extra that IGDB already has is an error).
- `pkg/seedgen/generate.go`, `catalog.go`, `db.go` – `Generate(snapshot, extra)`, alias validation, `COPY` into `game_aliases`, table in `Lock`/`Counts`/`Reset`/checksum.
- `pkg/seedgen/snapshot_test.go` – golden hash updated on purpose; `generate_test.go` – new `Generate` signature.
- `cmd/seed/main.go` – loads the extras, prints the alias count, wider table-name column; `pkg/testdb/testdb.go` – same `Generate` call as `cmd/seed`.

**Search**
- `pkg/catalog/search.go` (new) – search CTEs (title + aliases, `ILIKE` or `<%`), threshold, `NormalizeQuery`, LIKE escaping, `Suggest`.
- `pkg/catalog/store.go` – `base` joins the search matches (items + facets follow `q`), `relevance` order, threshold as the first batch query (also for the "page past the end" count); ORDER BY inserted with a placeholder instead of `fmt.Sprintf` (the SQL now contains `<%`).
- `pkg/catalog/types.go` – `SortRelevance`, `Filter.Query`, `Suggestion`.
- `pkg/catalog/search_test.go`, `search_integration_test.go`, `search_explain_integration_test.go` (new) – unit, integration and EXPLAIN tests.
- `pkg/server/catalog_query.go` – `searchParam` (trim, collapse, 2–100 characters), default sort `relevance` with `q`.
- `pkg/server/catalog_handlers.go`, `router.go` – `GET /api/search/suggest` (+ 405), `Cache-Control` for suggestions, `Suggest` in `CatalogReader`.
- `pkg/server/catalog_query_test.go`, `catalog_handlers_test.go`, `suggest_handler_test.go` (new) – tests.

**Frontend (types and client only)**
- `src/api/types.ts` – `Sort` includes `"relevance"` (`SORTS` unchanged), `Suggestion`, `SuggestResponse`.
- `src/api/catalog.ts` (+ `catalog.test.ts`) – `ProductsParams.q` (sent first), `getSuggestions(q)`.
- `src/features/store/sortLabels.ts` – one label `relevance: "Best match"` (required by `Record<Sort, string>`; not rendered).

**Docs**
- `docs/DATA_MODEL.md` – `game_aliases` table, ER diagram, listing sketch, search sketch 4 (implemented).
- `docs/PAAISKINIMAI_LT.md` – Task 13a section. `README.md` – `q`, `relevance`, suggest endpoint, `--aliases-only`, new checksum, and the pre-merge migration procedure.
- `CLAUDE.md` – Migration rules: every PR with a migration is migrated on production from the PR branch **before** the merge (owner decision in review).
- `docs/tasks/TASK_13a_search_backend.md`, this report.

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...` | OK |
| `go test ./...` | all packages OK (DB integration tests skip locally – no `TEST_DATABASE_URL`) |
| `npm run lint` | OK |
| `npm test` (PowerShell) | 27 files, **317 tests passed** |
| `npm run build` | OK |
| CI | see the PR / chat summary |

**Snapshot diff (only the alias field changed).** The old snapshot (`git show HEAD~:seed/igdb_snapshot.json`) and the new
one were parsed and compared after removing every `aliases` field: **identical**. In the text diff the only "removed"
lines are `]` → `],` (the closing bracket of `platforms`, now followed by `aliases`).
`TestAliasesDoNotChangeTheRestOfTheCatalog` proves the same for the generated catalog (games, products, offers, keys, all equal).

**Seed on `dev`** (`go run ./cmd/migrate up` → `00003` applied; `go run ./cmd/seed --reset`, twice):
```
  platforms       9
  regions         4
  games          50
  sellers         8
  game_aliases    134
  products      108
  offers        395
  keys         1573
  search aliases: 134 (IGDB + 3 hand-written)
catalog checksum: 4e94565d904cc1698b65cce04cbff8d9   (identical on both runs)
```
Products, offers and keys are the same counts as before (Task 08). **New checksums:** `catalog checksum`
`4e94565d904cc1698b65cce04cbff8d9` (was `aca2b5f17436a6f93970ac97f7081279`); golden hash in `pkg/seedgen`
`13c04c516f803ece6120a4e389eb81806f1ea62b6187fd22792ac272e1b91359` (was `c2a7beea…8437`). The new checksum is in the README;
`CLAUDE.md` never contained the old value, so it needed no change.

**Integration tests against real data.** No Postgres/Docker on this machine, and `pkg/testdb` (rightly) refuses Neon. As in
Task 09, I ran the catalog tests once with a **temporary, uncommitted** edit that pointed `newStore` (read-only SELECTs)
and the EXPLAIN test's transaction at the `dev` branch: **32 passed, 0 skipped, 0 failed** – all new search tests and every
existing catalog test (no regression in the listing). The edit was reverted (`git status` clean for those files). CI runs
them against its own Postgres.

**HTTP smoke test** (real router + store on `dev`, via `httptest`; `:8080` was taken by another local process I did not start):
`/api/search/suggest?q=gta%205` → 200, `public, s-maxage=300, stale-while-revalidate=600`, first item GTA V with
`matchedAlias: "GTA 5"`; `q=qwertyzz` → 200 `{"items":[]}`; `q=a` → 400; no `q` → 400 `q is required (2 to 100 characters)`;
`POST` → 405; all errors `no-store`. `/api/products?q=witchr%203` → The Witcher 3; `q=gta&platform=psn` → GTA V PSN;
`q=x` → 400; `sort=relevance` without `q` → popularity order.

### Threshold tuning: query → top 3 (real `Store.Suggest` on the seeded data)

`<%` keeps a term when `word_similarity(q, term) ≥ threshold`. Scores of the borderline cases decided the value:

| Query | Score that matters | At 0.6 (default) | At 0.5 | **At 0.55 (chosen)** |
|---|---|---|---|---|
| `witchr 3` | 0.583 (The Witcher 3) | misses it ✗ | finds | finds ✓ |
| `halflife` | 0.583 (Half-Life, Half-Life 2) | misses ✗ | finds | finds ✓ |
| `eldn ring` | 0.615 (Elden Ring) | finds | finds | finds ✓ |
| `the witcher` | 0.500 (Zelda: Breath **of the** Wild) | no | adds Zelda ✗ | no ✓ |
| `hl2` | 0.500 (Half-Life via "HL") | no | adds Half-Life ✗ | no ✓ |
| `red ded` | 0.429 (Dishonored) | no | no | no ✓ |
| `asdf` | 0.400 (Assassin's Creed …) | no | no | no ✓ |

Final result table (top 3 suggestions; *alias* = `matchedAlias`, shown only when the title did not match; total = products in the listing):

| Query | Top 3 | Games | Products |
|---|---|---|---|
| `witcher` | The Witcher 3: Wild Hunt | 1 | 2 |
| `witchr 3` | The Witcher 3: Wild Hunt | 1 | 2 |
| `the witcher` | The Witcher 3: Wild Hunt | 1 | 2 |
| `gta` | Grand Theft Auto V (*GTA 5*); GTA: San Andreas (*GTA San Andreas*); GTA: Vice City (*GTA VC*) | 4 | 8 |
| `gta 5` | Grand Theft Auto V (*GTA 5*); GTA: San Andreas (*GTA San Andreas*); GTA: Vice City (*GTA VC*) | 4 | 8 |
| `gta sa` | GTA: San Andreas (*GTA San Andreas*); Grand Theft Auto V (*GTA 5*); GTA: Vice City (*GTA VC*) | 4 | 8 |
| `elden` | Elden Ring; The Elder Scrolls V: Skyrim | 2 | 3 |
| `eldn ring` | Elden Ring | 1 | 1 |
| `skyrm` | The Elder Scrolls V: Skyrim | 1 | 2 |
| `bioshok` | BioShock; BioShock Infinite | 2 | 3 |
| `rdr2` | Red Dead Redemption 2 (*RDR2*); Red Dead Redemption (*RDR*) | 2 | 7 |
| `portal` | Portal; Portal 2 | 2 | 6 |
| `portl` | Portal 2; Portal | 2 | 6 |
| `zelda botw` | The Legend of Zelda: Breath of the Wild | 1 | 1 |
| `hzd` | Horizon Zero Dawn (*HZD*) | 1 | 3 |
| `halflife` | Half-Life 2; Half-Life | 2 | 4 |
| `hl2` | Half-Life 2 (*HL2*) | 1 | 1 |
| `assasins creed` | Assassin's Creed II; Assassin's Creed IV Black Flag; Assassin's Creed | 4 | 7 |
| `mass efect` | Mass Effect 2; Mass Effect; Mass Effect 3 | 3 | 8 |
| `fallout 4` | Fallout 4; Fallout: New Vegas; Fallout 3 | 3 | 6 |
| `gt` (2 letters) | Grand Theft Auto V (*GTA 5*); GTA: San Andreas (*GTA San Andreas*); GTA: Vice City (*GTA VC*) | 4 | 8 |
| `ac` (2 letters) | Assassin's Creed (*AC*); AC Brotherhood (*AC Brotherhood*); Assassin's Creed II (*AC2*) | 6 | 14 |
| `qwertyzz` | (nothing) | 0 | 0 |
| `asdf` | (nothing) | 0 | 0 |

Cyberpunk is not among our 50 games, so `cyberpnk` from the task's example list was replaced by `skyrm`, `bioshok`, `portl`, `mass efect`.
The top result of most rows is an assertion in `TestSearch_queryTable` (CI).

### EXPLAIN (match step, `dev`, `q = 'witchr 3'`)
With the default planner settings both tables are read with a **Seq Scan** – correct: 50 games and 134 aliases fit in one
page each, so reading the page is cheaper than any index. With `SET enable_seqscan = off` (what the planner does once the
tables are bigger) both halves use their trigram index for **both** conditions:
```
Append
  ->  Bitmap Heap Scan on games g
        ->  BitmapOr
              ->  Bitmap Index Scan on games_title_trgm_idx   Index Cond: (title ~~* '%witchr 3%'::text)
              ->  Bitmap Index Scan on games_title_trgm_idx   Index Cond: (title %> 'witchr 3'::text)
  ->  Bitmap Heap Scan on game_aliases a
        ->  BitmapOr
              ->  Bitmap Index Scan on game_aliases_alias_trgm_idx   Index Cond: (alias ~~* '%witchr 3%'::text)
              ->  Bitmap Index Scan on game_aliases_alias_trgm_idx   Index Cond: (alias %> 'witchr 3'::text)
```
`TestSearchMatchCanUseTheTrigramIndexes` checks this in CI (`SET LOCAL` in a rolled-back transaction).

### Threshold scope through PgBouncer
Checked through the Neon **pooler**, three times: inside the batch `current_setting('pg_trgm.word_similarity_threshold')`
= `0.55` and `'witchr 3' <% 'The Witcher 3: Wild Hunt'` = true; the very next query on the pool = `0.6` / false. Nothing leaks.

## 3. What the owner must do manually

Schema first, code second: the procedure now documented for every PR with a migration (CLAUDE.md "Migration rules", README "Database migrations").

1. **Before merging** (PR reviewed, CI green): **Actions → Migrate production → Run workflow**, "Use workflow from" = **`task/13a-search-backend`**. Check that the log shows `00003_search_aliases.sql` applied. The workflow checks out the chosen branch, so this applies the new migration. It is backward compatible: the code live now never reads `game_aliases`.
2. **Merge** this PR (**before** Task 13b). The new code deploys against a schema that is already in place; the automatic *Migrate production* run after the merge has nothing left to apply. Do not change `00003` after step 1; a fix would be a new migration.
3. Then **Actions → Seed production → Run workflow** with **`reset` ticked** and `confirm` = `seed-production`, so production gets the aliases. The log must show `game_aliases 134`, `search aliases: 134 (IGDB + 3 hand-written)` and **`catalog checksum: 4e94565d904cc1698b65cce04cbff8d9`** (the same as `dev`).
   - Until this runs, production search works on titles only (`game_aliases` is empty) – nothing breaks.
4. Nothing to do for `dev`: I already migrated it and reseeded it (`--reset`, checksum above).

## 4. Plain-language explanation

**Why aliases.** A typo ("witchr") shares most of its 3-letter pieces with the right word, so a fuzzy match finds it.
An abbreviation ("gta") shares almost nothing with "Grand Theft Auto V" – no fuzzy threshold can join them; somebody has
to *know* it. IGDB knows: its `alternative_names` list "GTA V", "GTA 5", "RDR2" … The snapshot tool fetched them for our
50 games only and wrote nothing else, so products, prices, keys and ids stay exactly the same (proved by a JSON comparison
and a test). Junk is filtered out (non-Latin titles, `.exe` file names). Three obvious abbreviations IGDB lacks are in a
small committed file with a reason each:

| Game | Alias | Reason |
|---|---|---|
| Horizon Zero Dawn | `HZD` | The usual abbreviation; IGDB only lists "Horizon". |
| Super Mario Odyssey | `SMO` | The usual abbreviation; IGDB lists no alternative name at all. |
| The Legend of Zelda: Breath of the Wild | `Zelda BotW` | How players write it; it mixes a title word and an alias word, so neither the title nor "TLoZ BotW" matched it alone. |

**Why a table.** `game_aliases` has one row per alias, with the same GIN trigram index as `games.title`. An array column
cannot be trigram-indexed per element, and with rows "which alias matched" is just the row.

**How matching works.** A game matches when its title or an alias *contains* the query (`ILIKE`, case-insensitive) or is
*similar* to it (`q <% term`: pg_trgm's `word_similarity` – how much of the query appears in the best matching part of the
term). Both conditions use the trigram indexes.

**The threshold.** Postgres' default 0.6 missed "witchr 3" (0.58); 0.5 let "the witcher" find Zelda. 0.55 sits between
(tuning table in section 2). It is set with `set_config(…, true)` as the first query of the same pgx batch: pgx runs a batch
as one implicit transaction, so the setting lives exactly as long as this request's queries. A plain `SET` would stay on
the pooled server connection (PgBouncer, transaction mode) and change other people's requests.

**Ranking ("Best match").** Exact > starts with > contains > only similar; then the similarity score, then popularity, then
id (deterministic). A game's rank is that of its best title or alias. With `q` this is the default sort; without `q`,
`relevance` gives exactly the popularity order.

**Facets.** The search is a `LEFT JOIN` + one `WHERE` line inside the shared `base` CTE, which every listing and facet query
reads – so platform/region counts and the price range describe the search result, with no extra code.

**Suggestions are one per game.** GTA V alone has 3 products; listing products would fill the 6 slots with 2 games. People
search for a game and pick the version on its page. Each suggestion links to the game's cheapest product that can be bought
now (RDR2 → Epic Games Europe €21.49, not Steam €42.99); if nothing is in stock, to its first product with no price.
`matchedAlias` is filled only when the title did not match, so the UI can show "GTA 5 → Grand Theft Auto V".

**Validation and safety.** `q` is trimmed, inner spaces collapsed, then must be 2–100 *characters* (else 400 with a clear
message). It reaches SQL only as a parameter; `%`, `_` and `\` are escaped for `ILIKE`, so `q=%%` finds nothing instead of
everything (tested).

## 5. Deviations from the task and why

- **Table `game_aliases` instead of `games.aliases text[]`.** The task offered both ("choose, explain"); reason above and in `DATA_MODEL.md`.
- **Threshold via `set_config(…, true)` in the batch.** Needed because the best value (0.55) is below the default 0.6, and the index can only use the operator. Transaction-local, so it is not session state (CLAUDE.md's PgBouncer rule); verified through the pooler.
- **Extra cleaning rule: no `.exe` names.** IGDB had executable names as aliases (`hl2.exe` under *Portal*, which would make "hl2" find Portal).
- **`cyberpnk` not in the table** – Cyberpunk 2077 is not one of our 50 games; replaced by other typo queries.
- **"Most popular product" when none is in stock** = the game's first product (lowest id). Products have no popularity of their own; the store's popularity sort breaks ties by id, and the seed always makes the main platform / Global / Standard product first.
- **`matchedAlias` is null whenever the title matched at all** (even if an alias matched better, e.g. "arkham asylum") – the task's wording "when the title did not".
- **Spaces-only `q` (`?q=%20%20`) → 400**, following "trimmed; length 2–100, otherwise 400". An empty `?q=` is still "not given", like every other parameter. Inner spaces are also collapsed (`witchr   3` = `witchr 3`) so they cannot change results or the cache key.
- **`q` given twice → 400 `q must be given once`** (the generic message suggests commas, which makes no sense for text).
- **Frontend:** `Sort` now mirrors the API and includes `"relevance"`; `SORTS` (what the Store's controls list and accept from the URL) is unchanged, so the Store looks and behaves exactly as before. `Record<Sort, string>` forced one label line (`relevance: "Best match"`) in `sortLabels.ts`; it is not rendered. `buildProductsQuery` now sends `q`, but `StorePage` still strips `q` before the request – wiring it is Task 13b.
- **Small extra:** the seed's table-count column was widened for `game_aliases`.

## 6. Open questions

Answered by the owner in review:

1. ~~Deploy/migration race~~ → **Resolved:** the owner runs *Migrate production* manually from the PR branch **before** merging, so the schema is ready before the code deploys. Documented as the procedure for every PR with a migration in `CLAUDE.md` (Migration rules) and `README.md` (Database migrations); section 3 follows it.
2. ~~2-letter queries~~ match any substring (`ac` also finds "Uncharted 4: El Desen**lac**e…" via an alias, at the bottom) → **kept as is**; Task 13b will report how it looks in the UI.
3. ~~IGDB alias oddities~~ (working titles such as "Great Rune" for Elden Ring, "Prince of Persia: Assassin" for Assassin's Creed) → **kept**.

Still open (no decision needed now):

4. `src/lib/storeParams.ts` still says the API does not use `q` yet – left for Task 13b, which wires `q` into the Store (avoids a merge conflict).

## 7. Self-review (task-reviewer)

The `task-reviewer` subagent was run on the committed branch (given only the task number). Its verdict: **CHANGES NEEDED**,
only because two deliverables did not exist yet. Summary of its output and what was done:

| Reviewer finding | What was done |
|---|---|
| Requirements 1–5, 7, 8, 10–17, 19: **done** (snapshot diff only `]` → `],`; cleaning rules; extras with reasons; backward-compatible `00003` + DATA_MODEL; matching/ranking with deterministic tie-break; EXPLAIN test; API contract; 2–100 validation, parameters only, LIKE escaping; suggest fields and caching; types only; unit and integration tests; LT docs) | – |
| Req. 6 *partly*: new checksum not recorded in the report | Recorded in section 2 (`4e94565d…cbff8d9`, from two real `--reset` runs on `dev`), with the golden hash change stated explicitly. |
| Req. 9 *missing*: query table (top 3) in the report | Section 2: tuning table (scores at 0.5 / 0.55 / 0.6) and the top-3 table from the real `Store.Suggest`. The comment in `search.go` and the LT docs point to it. |
| Req. 18 *missing*: owner manual steps | Section 3, in the exact order of the task, plus the expected log lines. |
| Scope creep: none (the `sortLabels.ts` label is required by `Record<Sort, string>`) | Explained in section 5. |
| CLAUDE.md violations: none | – |
| Export the session log and commit it | Done at the end of the session (`ai-logs/`, converted from the transcript, redacted), after the PR and CI. |
| Build/test results must be real | Section 2 (run on this branch). |
| `?q=` = not given vs `?q=%20%20` = 400 is a choice | Section 5. |
| Numbers (131 + 3 = 134 aliases, scores 0.58 / 0.50 / 0.40, checksum) must match the evidence | They come from the tool output, the tuning queries and the seed log quoted in section 2. |
| `SET LOCAL enable_seqscan` in the EXPLAIN test | Test-only, transaction-local (the transaction is rolled back) and on the throw-away CI Postgres; the app never changes planner settings. |
| `.vscode/` untracked | Not committed. |
