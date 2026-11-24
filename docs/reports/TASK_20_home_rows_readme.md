# Task 20 – One card per game in the home rows + README notes from the audit

Branch `task/20-home-rows-readme` (from `main` after PR #22). Task file: [`docs/tasks/TASK_20_home_rows_readme.md`](../tasks/TASK_20_home_rows_readme.md).

## 1. Files changed

| File | Change |
|---|---|
| `pkg/catalog/types.go` | `Item` gets `GameID int64` with `json:"-"` (internal, not in the API response) |
| `pkg/catalog/store.go` | the listing query selects `products.game_id` (CTE `base` → `page` → final SELECT) and `ListProducts` scans it into `Item.GameID` |
| `pkg/homepage/service.go` | `ProductRow` asks the catalog for `catalog.MaxPageSize` items and calls the new `onePerGame(items, limit)`: first item per game, in the given order, cut to `limit`, never `nil` |
| `pkg/homepage/service_test.go` | `TestProductRow_usesTheBlockConfig` adjusted (bigger page asked for) + 5 new tests (see §2) |
| `pkg/homepage/store_integration_test.go` | the product-rows integration test now rebuilds the expected row from the whole listing by game id, and fails when a title appears twice in a row |
| `pkg/catalog/store_integration_test.go` | new `TestListProducts_gameIDIdentifiesTheGame` |
| `pkg/catalog/types_test.go` (new) | `TestItem_gameIDIsNotSentToTheFrontend` |
| `README.md` | the four places of the task (logs, sellers, homepage clause, "Before the planning chat" wording) + test counts |
| `docs/DATA_MODEL.md`, `docs/DESIGN.md`, `docs/PAAISKINIMAI_LT.md` | the home rows are described as "one card per game"; new Lithuanian section for the interview |
| `docs/screenshots/task20-home-rows-{desktop,mobile}.png` | full-page home at 1440 and 390 px |
| `docs/tasks/TASK_20_home_rows_readme.md` | the task file, verbatim (first commit) |

No migration, no seed, no schema change, no frontend change, no new dependency.

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...` | pass |
| `go test ./...` | pass. `go test -json`: **233 top-level tests** (157 pass, 76 skip locally = database integration tests, `TEST_DATABASE_URL` is empty; CI runs them), **447 subtests**, 0 failures |
| `npm run lint`, `npm test` (PowerShell), `npm run build` | pass; 628 frontend tests in 50 files (unchanged) |
| TDD | the tests were written first and did not compile (no `GameID`). After the implementation, a mutation check (the "already seen" test switched off) made 3 of the new unit tests fail, so they do catch the bug |
| Live check, local stack against Neon `dev` (`cmd/local` + Vite, both on 127.0.0.1) | `popular`, `discounts`, `new-releases`: **5 cards each, 5 different games each**; the JSON has no game id. Screenshots: `docs/screenshots/task20-home-rows-desktop.png` (1440 px) and `-mobile.png` (390 px): no repeated cover in any row |
| axe-core 4.14.1 (wcag2a/2aa/21a/21aa/best-practice, reduced motion) on `/` | **0 violations at 1440 px and 0 at 390 px** |
| CI (PR #23, commit `216d35a`) | **green**: `go` 56 s, `frontend` 41 s, `migrations` 52 s (every migration Up/Down/Up, then the database integration tests on the real Postgres seed, including the new row and `GameID` tests), Vercel Preview deployed |

**A bug found only by the live check.** My first commit added `game_id` to the SQL but a scripted edit missed the `Scan` call, so the query returned 18 columns and the code read 17: `catalog: scan item: number of field descriptions must equal number of destinations` and all three rows answered `500`. Unit tests use a fake catalog and the DB tests cannot run locally (no Postgres), so only the real stack showed it. Fixed in the next commit (`5a467d3`). CI's `migrations` job runs the real-Postgres tests (every Store test would have failed on this), so it would also have caught it.

**Test counts.** README says 233 Go test functions (157 + 76) and 447 subtests. The subtest number is 447 on `main` too: the 445 in the Task 18 report was already out of date before this task, so only the function counts (226 → 233: +5 unit tests in `service_test.go`, +1 unit test in `types_test.go`, +1 integration test) are new in this task. Frontend 628 is unchanged.

## 3. What the owner must do manually

1. Review the PR and merge when CI is green (no migration, so no pre-merge production step).
2. After the deploy, open the production home page: no game repeated in any row (Popular right now, Biggest discounts, New releases); each row has 5 cards.
3. Run `/export` for this session and put the log in `ai-logs/` (I cannot run `/export`; the log is not committed yet). The README still says 23 log files / 25 tasks / 22 PRs, as the task said to change only the test counts (see §6).

## 4. Plain-language explanation (for the interview)

**What was wrong.** One game is sold as several products: GTA V on Steam, on PSN, "Premium". The home rows took the first 5 products of a sort. The sort puts versions of one popular game side by side, so "Popular right now" showed GTA V three times. That is the first thing a reviewer sees.

**What changed.** Only the three home rows. The API asks the catalog for a big page (48, the most it allows), walks through it, keeps the first product of every game it has not shown yet, and stops at 5. The Store, search, tiles, platforms and hero are untouched.

**Why on the backend, not in the frontend.**
- The frontend only gets 5 cards. If it hid one repeat it would have 4 and nothing to fill the gap with; the full list is only on the server, which can drop repeats first and cut to 5 afterwards.
- "One card per game" is a content rule, and the assignment says the frontend only displays what it receives. So the rule lives in `pkg/homepage`, next to the other block rules, and is unit-tested with a fake catalog.
- The response shape stays the same (`{items, viewAllHref}`), so the frontend did not change at all.

**Why by game id and not by title.** A title is text. Two different games can share a title, and one game could be spelled differently on two products. The `products.game_id` column is the database's own answer to "is this the same game?". The query already joins `games`, so it costs nothing extra. The id is `json:"-"`: it never leaves the server, so nobody can depend on it.

**Why the first version in the row's sort order.** No new rule was needed: each row already has an order (most popular, biggest discount, newest). The first product of a game in that order is exactly the one that would have been on top anyway, so "Biggest discounts" shows the version with the biggest discount, and so on. The row is also honest: if the catalog had only 3 games, it shows 3 cards and never repeats a game to fill the gap.

**One thing to know if asked.** The version that stays is chosen by the row's sort only. On `dev`, the first GTA V version in "Popular right now" is out of stock, so its card says "Out of stock" (the popularity sort does not look at stock). That is the same card the Store shows first for that sort, and the owner's decision was not to add sort rules.

**Performance question.** Asking for 48 instead of 5 uses the same query (same sort, same `LIMIT`), with up to 48 rows and their cheapest offers instead of 5; with 108 products it is one round trip, and the home endpoints are cached.

**README notes.** Logs wording (no promise of raw transcripts), sellers are fictional with invented ratings, the homepage clause (database chooses icon and colour by name, the frontend maps the names to drawings, banner files are static assets the database points to), and the "Before the planning chat" sentence ("unrelated personal topics") are exactly the wording of the task.

## 5. Deviations from the task and why

- None in behaviour. Additions inside "tests first": `TestProductRow_sameTitleDifferentGameIsNotARepeat`, `..._emptyCatalogGivesAnEmptyRowNotNull`, `..._cutsToTheLimitAfterRemovingRepeats`, `TestItem_gameIDIsNotSentToTheFrontend`, `TestListProducts_gameIDIdentifiesTheGame`.
- Screenshots are full-page (1440 × 2880 and 390 × 3623), so all three rows are visible in one image; the 2.2 MB desktop PNG is the biggest file in `docs/screenshots/`.

## 6. Open questions

1. The README still says **25 tasks, 22 pull requests, 254 commits on `main` before Task 19, 23 log files**. The task asked to update only the test counts, so I left them. After this PR they will be one behind (23 PRs, 24 logs once this session is exported). Should the next README touch update them?
2. The seed has **GTA V Steam out of stock**, so the first card of "Popular right now" says "Out of stock". It is the owner's rule ("first in the row's sort order") and I did not change it. If it should show an in-stock version, that needs a new sort rule (a different task).

## 7. Self-review (output of the `task-reviewer` subagent, run before this report; 6 commits at that time)

```
# Task review: TASK_20_home_rows_readme.md
Branch: task/20-home-rows-readme   Commits: 6 (task file first, 1a6c405)   Files changed: 14

## 1. Requirements
1  De-dup only in the home product rows; Store, search, tiles, platforms, hero untouched ........ done
   (only behaviour change is pkg/homepage/service.go ProductRow/onePerGame; pkg/catalog/store.go only adds game_id to SELECT and Scan)
2  Keep the first item in the row's own sort order, no new sort rules ........................... done
3  Row shows `limit` cards; fewer games = shorter row, never repeats a game ...................... done
4  "View all" links unchanged ........................................................................ done
5  De-dup in pkg/homepage, asks for catalog.MaxPageSize, cuts to limit ........................... done
6  De-dup by game id, json:"-", filled in the listing query, API shape unchanged ................. done
7  Unit tests first (repeats removed, order kept, first version kept, fewer than limit) ......... done
8  DB integration test (no game twice in any row, each row has limit cards on the seed) ......... done
9  Home checked at 1440 and 390 px, screenshots ................................................... partly
   (screenshots exist; the reviewer could not verify "no repeated cover" from the repo; the report did not exist yet)
10 DATA_MODEL, DESIGN, PAAISKINIMAI_LT updated ................................................... done
11-14 README logs / sellers / homepage clause / "Before the planning chat" wording ................ done
15 Test counts ................................................................................... partly
   (233 = 157 + 76 matches +6 unit +1 integration; the subtest figure went 445 -> 447 but the diff adds no t.Run;
    unsure whether the counting method differs)
16 Standard checks, CI green, axe 0, no migration, no seed ........................................ partly (no report yet)
17 Report sections 1-7 ............................................................................ missing (expected at that stage)

## 2. Not asked for (scope creep): none found.
## 3. CLAUDE.md violations: none found (no new dependency, go.mod unchanged, no migration, no secrets, small commits).
## 4. Missing explanations / tests: none in code. Could not see whether the new DB tests skip on an empty TEST_DATABASE_URL
   (they use the existing newStore/env helpers).
## 5. Other observations
- README still says "25 tasks" and "254 commits on main before the last task (Task 19)"; the task did not ask to change it.
- The PAAISKINIMAI_LT answer says 48 rows are fetched; catalog.MaxPageSize is 48: consistent.
- .vscode/ is untracked and not part of the diff. Do not commit it.

## Verdict: CHANGES NEEDED
Code, tests, docs and README edits meet the task. Open items: the missing report (expected), the unexplained 445 -> 447 subtest
count, and the unverifiable screenshot / axe / CI claims, which the report must support.
```

What was done about each finding:

| Finding | Action |
|---|---|
| Report missing | This file. |
| 445 → 447 subtests unexplained | Measured with the same `go test -json` method on `main` and on the branch: **447 on both**. The Task 18 number was already stale; this task adds no subtests. Explained in §2. |
| Screenshot / axe / CI claims not verifiable | Commands, numbers and the two screenshots are in §2; CI result is added below after the PR run. |
| New DB tests skip on an empty `TEST_DATABASE_URL`? | Yes: they use `newStore(t)` / `newEnv(t)`, which call `testdb.Pool(t)`; it skips when the variable is empty (locally 76 skipped, none failed). |
| README "25 tasks / 254 commits" | Left as the task says; raised as open question 1. |
| `.vscode/` untracked | Not committed. |
