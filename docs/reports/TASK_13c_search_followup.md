# Task 13c – Search follow-up: 2-letter queries match word starts; edition in suggestions

Task file: [`docs/tasks/TASK_13c_search_followup.md`](../tasks/TASK_13c_search_followup.md). Branch `task/13c-search-followup` (worktree `../ENEBA-homework-13c`, created from `origin/main` after Task 13b was merged). No migration.

## 1. Files changed

**Backend (`pkg/catalog`)**
- `search.go`: the match step of `searchCTEs` has two branches now. Short query (≤ 2 characters, counted in runes): `term ~* @q_word_start`. Otherwise the old `ILIKE '%q%' OR q <% term`. `searchArgs` builds the two new parameters `short_query` and `q_word_start` (`(^|[^[:alnum:]])` + `regexp.QuoteMeta(q)`). `suggestSQL` selects `p.edition`; `Suggest` scans it. Comments explain the SQL.
- `types.go`: `Suggestion.Edition` (`json:"edition"`).
- `search_test.go` (unit): `short_query` / `q_word_start` per length (incl. `ü?` = 2 characters), regex characters escaped (`.*`), NULLs for an empty query.
- `search_integration_test.go` (CI): query table + `re`, `ac`, `li`; new `TestSearch_twoCharactersMatchWordStarts` (complete expected lists for suggestions **and** listing: `re ha li ed he ac ro .*`); `edition` asserted in `TestSuggest_productChoice`; `TestSuggest_onePerGameAtMostSix` now uses `the` (`ac` no longer matches 6 games, see §5).
- `search_explain_integration_test.go` (CI): the index test is table-driven, `witchr 3` (ILIKE / `<%`) and `re` (`~*`).

**API contract/tests:** `pkg/server/suggest_handler_test.go` (JSON now has `edition`, always a string).

**Frontend**
- `src/api/types.ts`: `Suggestion.edition`. `src/api/catalog.test.ts`: body with `edition`.
- `src/features/search/SuggestionOption.tsx` + `.module.css`: a muted 12px line under the title when `edition !== "Standard"` (same rule and look as the Store card).
- `src/features/search/highlight.ts` + test: for a 2-character query the highlight marks the **word-start** hit, like the server (see §5).
- `src/features/search/SearchBox.test.tsx`: edition shown only when not "Standard".

**Docs:** `docs/DATA_MODEL.md` (search sketch: new parameters, word-start branch, index note), `README.md` (search rules, suggest JSON), `docs/DESIGN.md` 4.13 (edition line, highlight), `docs/PAAISKINIMAI_LT.md` (new "Task 13c" section), `docs/reports/assets/task13c_*.png` (our screenshots), this report, the task file.

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...`, `go test ./...` | pass. `go.mod` still `go 1.25.0` |
| `npm run lint` | 0 problems |
| `npm test` (PowerShell) | **31 files, 383 tests passed** (+5: highlight 4, SearchBox 1) |
| `npm run build` | pass |
| Integration tests (`TEST_DATABASE_URL`) | **not run locally** (no local Postgres, and the helper refuses Neon by design). They run in CI (job `migrations`). Instead I ran the same queries by hand against the Neon **dev** branch (read-only, a throwaway program in the session scratchpad, not in the repo): every expected list in the new tests was confirmed there, and the `EXPLAIN` of the match step was replayed in a rolled-back transaction with `enable_seqscan = off`: `witchr 3` still shows `BitmapOr` of two `Bitmap Index Scan`s per table, `re` shows `Bitmap Index Scan … Index Cond: (title ~* '(^|[^[:alnum:]])re')` on both trigram indexes. |
| Real API + browser | production build served on 127.0.0.1 against the API (Neon dev), headless Edge at 1440×900 and 390×844 |

### 2-letter queries: before → after (suggest API on `dev`, first 6 games, aliases in brackets)

| q | Before (13b) | After (13c) |
|---|---|---|
| `re` | RDR 2, Red Dead Redemption, Elden Ring [Great Rune], Dishonored, CoD 4, GTA: San Andreas (4 noise) | **Red Dead Redemption 2, Red Dead Redemption** |
| `ha` | Half-Life 2, Half-Life, Hades, Uncharted 4, Batman: Arkham City, Batman: Arkham Asylum | **Half-Life 2, Half-Life, Hades** |
| `gt` | GTA V [GTA 5], San Andreas, Vice City, GTA IV | same (alias word start) |
| `ac` | 4× Assassin's Creed [AC…], Batman: Arkham City [Batman: AC], GTA V [Grand Theft Auto V Leg**ac**y] | the 4 Assassin's Creed + Batman: Arkham City [Batman: AC] (GTA V gone) |
| `ro` | 6 mid-word hits (Uncharted [Fine di un ladro], Horizon, Tomb Raider, Skyrim, BioShock Infinite, Bloodborne…) | **nothing** (no word starts with "ro") |
| `he` | Max Payne [Max Heat], Witcher 3, Skyrim, Zelda BotW, Hollow Knight, TLOU II | **Max Payne [Max Heat]** |
| `ca` | CoD 4, BioShock Infinite [Project Icarus] | **CoD 4** |
| `mi` | Minecraft, Witcher 3 [Wiedźmin 3: Dziki Gon] | **Minecraft** |
| `ho` | Horizon, Hollow Knight, Witcher 3 [Zaklínač 3: Divoký hon], Uncharted 4 [Kaizokuou…], BioShock, BioShock Infinite | **Horizon, Hollow Knight, Witcher 3 [… Divoký hon]** (the alias word "hon" does start with "ho") |
| `th`, `wi`, `br`, `ba` | – | unchanged (all hits are word starts) |
| `li` | Life Is Strange, Half-Life 2, Half-Life | same ("Life" after the "-" is a word start) |
| `.*`, `l.` | – / nothing | nothing (regex characters are plain text) |
| 3+ characters (`gta`, `witcher`, `witchr 3`, `rdr2`, `hl2`) | – | identical output before and after (compared old build vs new build on `dev`); the 13a query table in the tests is unchanged |

Edition on `dev`: `gta sa` → "Grand Theft Auto: San Andreas" with `edition: "Game of the Year Edition"` (the picked in-stock product), `rdr2` → `"Standard"`.

### Comparison with eneba.com (1440 / 390)
Reference screenshots (headless Edge, `witcher` typed on eneba.com) stay outside the repo. Ours: `docs/reports/assets/task13c_dropdown-edition-{desktop,mobile}.png` (`san`), `task13c_dropdown-2letter-{desktop,mobile}.png` (`re`).

| Eneba | Ours | Still different (why) |
|---|---|---|
| The edition is part of the SEO title ("The Witcher 3: Wild Hunt **GOTY** GOG.com Key GLOBAL") | a separate muted 12px line under the title, only for a special edition | Our title is the game's name (one row per game); a separate line is the same pattern as our Store card |
| One row per product | one row per game | by design (13a) |
| Query-text rows, "Digital good" pill, old price + ⓘ, ← back arrow on phones | not built | no data / owner decisions in 13b |
| Everything else in the row (cover, price block, paddings, hover colour) | unchanged from 13b | see the 13b report |

At 390 px the edition line fits on one line and the row keeps its layout (see the screenshots; no overflow measurement was run this time).

## 3. What the owner must do manually
1. No migration: nothing to run before the merge.
2. Open the PR Preview (Neon `dev` data). Type `re`, `ac`, `ro`, `li`, `gt` in the header: only word starts appear. Type `san`: the GOTY row shows "Game of the Year Edition". Check on a laptop and a phone.
3. Wait for CI (the integration tests only run there): the `migrations` job must be green.
4. Run `/export` at the end of the session and commit the log in `ai-logs/` on this branch (I could not run `/export` myself).
5. The worktree `../ENEBA-homework-13c` can be removed after the PR is opened (`git worktree remove ../ENEBA-homework-13c`; `node_modules` inside it is git-ignored).

## 4. Plain-language explanation
With two letters, "contains" is too loose: "re" is inside "Dishonored" and in dozens of foreign-language aliases. So a 2-character query now matches only where a word **starts** (start of the text, or after a space/punctuation). "re" finds Red Dead Redemption but not Dishonored; "gt" still finds GTA because the alias "GTA 5" starts with "gt"; "ac" finds Assassin's Creed through the alias "AC". Three or more characters work exactly as before. The same rule applies to the Store search (`/api/products?q=`) and the dropdown (`/api/search/suggest`) because they share one SQL fragment.

Each dropdown row also says which edition it links to when it is not Standard. The link goes to the cheapest in-stock product, which can be a special edition (San Andreas: Standard is out of stock, the GOTY edition is not), so without that line the page that opens would look surprising.

## 5. Deviations from the task and why
- **Highlight (not in the task):** the dropdown marks the typed text in yellow. With the new rule the first occurrence can be in the middle of a word while the match is a later word start, so `highlight.ts` follows the same rule for ≤ 2 characters. Small, tested, documented.
- **`TestSuggest_onePerGameAtMostSix`** used `ac` (14 products of many games). `ac` now matches 5 games, so the test uses `the` (6+ games).
- **Resident Evil** from the task's example is not in the 50-game seed; `re` uses the two Red Dead games.
- **Index-friendly:** the condition is a regex (`~*`); pg_trgm's GIN index supports it (checked with `EXPLAIN`, see §2), so no separate "not index-friendly" case remains. With a cached *generic* plan the planner may keep both OR halves (same result, only the plan differs); documented in `DATA_MODEL.md`.

## 6. Open questions
- `[[:alnum:]]` in Postgres depends on the database locale for non-ASCII letters; the frontend highlight uses Unicode letters/digits. They can differ only for exotic characters. Not worth a rule now; say so if you want a stricter ASCII-only definition.
- A query that *starts with punctuation* (`'s`) needs a non-alphanumeric character before it, so it never matches "Assassin's". Irrelevant for game search; not special-cased.

## 7. Self-review (the `task-reviewer` subagent)
Verdict **PASS**. Requirements 1–19 and 22 done; 20–21 (this report's before/after table and the session log) were open only because the report did not exist yet. No CLAUDE.md violations, nothing missing in tests or explanations.

| Finding | What was done |
|---|---|
| Index-use claim: "a 2-character regex behind a character class might not be indexable"; the `~*` EXPLAIN assertion is the likeliest CI failure | The exact EXPLAIN was replayed on real Postgres (Neon dev) in a rolled-back transaction with seq scans off: both tables show a `Bitmap Index Scan` with the `~*` index condition (§2). The CI Postgres version can differ; if the assertion fails there, it is the test, not the search, that needs adjusting |
| `short_query` folded into a constant only for custom plans | Wording softened in the `search.go` comment and `DATA_MODEL.md` (generic plan may keep both halves, same result) |
| Misleading comment on the `li` test row ("more popular") | Fixed: it wins by rank tier (prefix beats a word start in the middle) |
| Highlight uses Unicode letters, Postgres `[[:alnum:]]` is locale-dependent | Documented in §6, no change |
| Expected want-lists not run by the reviewer | Confirmed by hand against `dev` (§2); CI runs them |
| Scope notes (highlight, DESIGN.md, screenshots, `the` instead of `ac`) | Listed in §5; all consequences of the new rule |
