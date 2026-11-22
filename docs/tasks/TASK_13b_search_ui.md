# Task 13b – Search UI: header suggestions, search results on the Store page

**Model:** Opus · **Effort:** high
**Runs in parallel with Task 13a** (backend). Another session works in the main folder, so use a separate worktree:
```
git worktree add ../ENEBA-homework-13b -b task/13b-search-ui origin/main
```
Build against the API contract in `docs/tasks/TASK_13a_search_backend.md` §4 (copy of it below). Until 13a is merged, use mocked `apiFetch` in tests and a small local mock for the browser check. After 13a is merged, rebase on `main` and verify against the real API before asking for review. Remove the worktree after the PR is opened.

## API contract (from 13a)
- `GET /api/products?q=…` – `q` (2–100 chars) filters items and facets; sort `relevance` ("Best match") is the default when `q` is set.
- `GET /api/search/suggest?q=…` → `{ items: [{ gameTitle, productSlug, platform{slug,name}, region{slug,name}, coverUrl, priceCents|null, inStock, matchedAlias|null }] }`, max 6, one per game, relevance order. Types and `getSuggestions(q)` are added by 13a in `src/api/` – if they are not on `main` yet, add identical ones and resolve on rebase.

## Decisions (made by the owner – do not change)
- Q2. **Header suggestions** (desktop field and the phone search overlay), ARIA 1.2 **combobox + listbox** pattern:
  - from 2 characters, debounced ~200 ms, TanStack Query with `keepPreviousData` (no flicker while typing), cancel/ignore stale responses;
  - up to 6 rows: small cover, title (matched part highlighted when it is a plain substring), "matched alias" hint when present (e.g. *GTA V*), platform · region, price or "Out of stock";
  - last row: "See all results for 'q'" → `/store?q=…`;
  - keyboard: ↓/↑ move (wraps), Enter on a row → product page, Enter with no active row → `/store?q=…`, Esc closes (second Esc clears), Tab leaves; mouse click on a row works; click outside closes;
  - loading: subtle spinner in the field; no results: "No matches for 'q'" row + the "See all results" row is hidden.
  - Hover/focus prefetch of the product query, like Store cards.
- Q3/Q5. **Store page with `q`:**
  - remove the Task 11 note "Text search arrives in a later task…"; send `q` to the API;
  - heading "Results for 'q'" (+ result count as now) and a "Clear search" control that removes only `q`;
  - sort select shows "Best match" **only when `q` is set** (default then); if `q` is removed while sort is `relevance`, fall back to popularity (sanitizer);
  - no results: "No results for 'q'" + "Clear search" + a **"Popular right now"** grid of 8 products (default listing, page size 8).
  - The header field shows the current `q` on `/store`.
- Follow eneba.com's search dropdown look (CLAUDE.md comparison rule; reference screenshots outside the repo). No dead UI (no "recent searches", categories, etc., unless they work).

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/13b-search-ui`, in the worktree).

## 2. Tests (Vitest)
Combobox: debounce (one request for fast typing), keyboard navigation and wrap, Enter behaviours, Esc twice, `aria-activedescendant`/`aria-expanded`/`aria-controls` correct, highlight function (substring, case-insensitive, no match → plain). Store: `q` sent to the API, heading + Clear search, "Best match" only with `q`, sanitizer fallback, empty state with popular grid.

## 3. Verify
Standard checks; real browser (after rebasing on 13a, against the local API on `dev`): screenshots desktop + phone of the dropdown (normal, alias hit like `gta`, no matches), Store results for `q`, the empty state; axe 0 violations with the dropdown open; comparison table vs eneba.com.

## 4. Docs
`docs/PAAISKINIMAI_LT.md`: combobox ARIA pattern and why; debounce + stale responses; highlight; why the URL keeps `q`; relevance sort only with `q`.

## Report
As defined in `CLAUDE.md` (incl. comparison table, Self-review). Export the session log at the end and commit it on this branch.
