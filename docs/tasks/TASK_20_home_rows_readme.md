# Task 20 – One card per game in the home rows + README notes from the audit

Model: **Sonnet, high effort**. Branch: `task/20-home-rows-readme` from `main` **after PR #22 (Task 19) is merged**.
Follow `CLAUDE.md` as always (task file verbatim as the first commit, TDD, report, session log, task-reviewer, never merge).

Background: Task 19 audit, findings F5, F2, F10, F13 and the owner's answers to §6 (Q1, Q2, Q4, Q5).

## 1. Home product rows: one card per game (Q2 – owner decision: fix)

Problem: "Popular right now" shows GTA V three times (Steam, PSN, GOTY), Witcher 3 twice; the other rows repeat games too. It is the first thing a reviewer sees.

Decisions (made by the owner, do not change them):
- **Only the home page product rows** (`GET /api/blocks/products/{key}`) change. The Store, search, tiles, platforms and the hero stay exactly as they are.
- **One card per game.** The card that stays is the **first one in the row's own sort order** (popularity → the most popular version, discount → the version with the biggest discount, newest → the newest). No new sort rules.
- The row still shows `limit` cards (5 today). If the catalog has fewer distinct games than `limit`, show what there is; never repeat a game to fill.
- "View all" links stay the same.

Implementation guidance:
- Do the de-duplication in `pkg/homepage` (service layer), not in the frontend: ask the catalog for a bigger page (`catalog.MaxPageSize`), keep the first item per game, cut to `limit`.
- De-duplicate by a **game identifier**, not by title text. If `catalog.Item` has none, add one that is **not sent to the frontend** (`json:"-"`) and fill it in the listing query. The API response shape must not change.
- Tests first: unit test in `service_test.go` with a fake catalog (repeats removed, order kept, first version kept, fewer games than `limit`), and the DB integration test for the real rows (no game twice in any row, each row still has `limit` cards on the seed).
- Check the home page at 1440 and 390 px (local stack against Neon `dev`): no repeated cover in any row. Screenshots in the report.
- Update `docs/DATA_MODEL.md` / `docs/DESIGN.md` where the home rows are described, and `docs/PAAISKINIMAI_LT.md` (what, why, what may be asked in the interview).

## 2. README notes (Q1, Q4, Q5) and one wording fix

Change only these places, keep the rest of the README as it is:

1. **Logs (Q1)**, in the "Claude Code sessions" line: say that each log keeps every message of the owner and every reply of Claude Code in full; tool calls are shortened and Claude's internal reasoning is not included; secrets, e-mail addresses and user names are redacted. **Do not** promise that raw transcripts can be shared on request.
2. **Sellers (Q4)**, in the Scope / shortcuts list: sellers are fictional, and their ratings and review counts are invented seed data (there are no buyer reviews).
3. **Homepage (Q5)**, one clause in the Homepage row of the assignment table: the database chooses the icon and colour by name, the frontend only maps names to drawings, and the banner image files are static assets the database points to.
4. **"Before the planning chat" line:** replace "It also covered the owner's personal job search, so it is not shared." with "It also covered unrelated personal topics, so it is not shared." Nothing else in that line changes.
5. Update the test counts if they change.

## 3. Checks

Standard checks (gofmt, build, vet, go test, lint, npm test, build), CI green, axe 0 on `/` at 1440 and 390 px.
No migration, no seed. After the merge the owner checks production home: no repeated game in any row.

## 4. Report

The usual report sections 1–7 in `docs/reports/TASK_20_home_rows_readme.md`. In section 4 explain simply, so the owner can repeat it in the interview: why the de-duplication is on the backend, why by game id and not by title, and why the first version in the row's sort order is kept.
