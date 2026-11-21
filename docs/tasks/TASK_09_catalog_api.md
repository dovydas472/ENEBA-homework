# Task 09 – Catalog API (product list with filters/sort, product page, facets)

**Model:** Sonnet · **Effort:** high

## Goal
The first real API the UI will use: store listing with filters, sorting and paging; product page data with seller offers; filter options with counts. Backed by hand-written `pgx` queries, tested against the deterministic seed in CI.
No UI in this task (only typed frontend API functions).

## 0. Session start
1. Run `gh auth status`. If not logged in, **stop and tell the owner** to run `! gh auth login --web` in this session (they enter the code on github.com/login/device), then continue.
2. Commit any uncommitted `ai-logs/` file on this branch (standard rule).

## Decisions (made by the owner – do not change)
- Endpoints (JSON, **camelCase** fields like the existing `dbLatencyMs`), error body stays `{"error":"..."}`:
  - `GET /api/catalog/facets`
  - `GET /api/products`
  - `GET /api/products/{slug}`
- Money as integer cents in JSON; formatting is the frontend's job.
- **Listing** (`GET /api/products`) query params:
  - `platform`, `region`: comma-separated slugs, multi-select (`platform=steam,psn`). Unknown slugs simply match nothing.
  - `minPrice`, `maxPrice`: integer cents ≥ 0, `min ≤ max`. Price filter uses the stock-aware cheapest price, so out-of-stock products are excluded when a price filter is set (see `DATA_MODEL.md`).
  - `sort`: `popularity` (default) | `price_asc` | `price_desc` | `discount` | `newest` | `title`. Out-of-stock products sort last for price and discount sorts.
  - `page` (default 1), `pageSize` (default 24, max 48).
  - Invalid values → `400` with a clear message (e.g. `"sort must be one of …"`). Never silently ignore an invalid value.
  - No text search yet (`q` comes in the search task).
  - Response: `{ items: [...], total, page, pageSize }`. Item: `slug, title, edition, platform {slug,name}, region {slug,name}, coverUrl, priceCents (null if out of stock), msrpCents, discountPercent (null if unknown), offerCount, inStock`.
- **Product page** (`GET /api/products/{slug}`):
  - `product`: slug, edition, platform, region, msrpCents, priceCents (cheapest buyable or null), inStock.
  - `game`: title, description, genres, releaseDate, developer, publisher, coverUrl.
  - `offers`: only buyable offers, cheapest first: `offerId, priceCents, stock, seller {slug, name, rating (null = new), ratingLabel ("Superb" | "Excellent" | "Very good" | "Good" | null), isNew, reviewsCount}`.
  - `variants`: the other products of the same game (slug, edition, platform, region, priceCents, inStock) – for "other versions" on the page.
  - Unknown slug → `404`.
- **Facets** (`GET /api/catalog/facets`): platforms and regions with **global** product counts (whole catalog, not depending on the current filters), only entries with count > 0, ordered by `sort_order`. Plus `priceRange {minCents, maxCents}` over in-stock products.
- **Rating label** is computed in Go from the thresholds in `DATA_MODEL.md` (≥9.75 Superb, ≥9.5 Excellent, ≥9.0 Very good, ≥8.0 Good, NULL = new seller).
- **Edge caching** (Vercel CDN) via `Cache-Control`:
  - listing and facets: `public, s-maxage=60, stale-while-revalidate=300`
  - product page: `public, s-maxage=15, stale-while-revalidate=60`
  - errors: `no-store`.
  Checkout re-checks stock and price anyway, so short staleness here is safe – explain this in the docs.
- DB unavailable → `503` with a generic message (same rule as health). Never return SQL or driver errors.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/09-catalog-api`).

## 2. Data access – `pkg/catalog`
- `Store` (holds the pgx pool) with `ListProducts(ctx, Filter) (Page, error)`, `GetProduct(ctx, slug) (ProductDetail, error)` returning `ErrNotFound`, `Facets(ctx) (Facets, error)`.
- SQL based on the sketches in `docs/DATA_MODEL.md` (one query for the listing page incl. `count(*) OVER ()` for `total`). If you change a query, update `DATA_MODEL.md` in the same PR.
- Arrays of slugs passed as one parameter (`= ANY($1)`), never string-built SQL.
- Pure helper `RatingLabel(rating *float64) *string` (or similar) with table tests incl. exact thresholds (9.75, 9.749…, NULL).

## 3. HTTP – `pkg/server`
- Handlers depend on a small interface (e.g. `CatalogReader`), injected through `Deps`, like `DBPinger`.
- Query parsing/validation in a pure function with table-driven tests (all valid combos + each invalid case → message).
- Handler tests with a fake `CatalogReader`: status codes (200/400/404/503), JSON shape, `Cache-Control` per case, no internal error text in the body.
- Register routes in `NewRouter`; `api/index.go` and `cmd/local` build the real store from the existing pool.

## 4. Integration tests (run in CI)
- Small helper `pkg/testdb`: if `TEST_DATABASE_URL` is empty → `t.Skip`. Otherwise apply migrations (goose provider, embedded) and seed the deterministic catalog with `pkg/seedgen` (reset), once per test package.
- Tests against the real seed (values are stable because the seed is deterministic – take them from the Task 08 report / your own run on `dev`):
  - default sort: first item `grand-theft-auto-v-steam-global`; `total` = 108;
  - `platform=psn`: every item has platform `psn`;
  - `sort=price_asc`: in-stock items first, ordered by price; out-of-stock last with `priceCents = null`;
  - `minPrice`/`maxPrice`: no out-of-stock items, all prices inside the range;
  - `the-witcher-3-wild-hunt-steam-global`: offers cheapest first (10.99 first), the "New seller" has `rating = null`, `isNew = true`; no offer with stock 0;
  - unknown slug → `ErrNotFound`;
  - facets: no platform with count 0 (Battle.net absent), counts add up to 108.
- If more than one package ever uses the test DB, CI must run them with `-p 1` – add a comment in `ci.yml`.

## 5. Frontend API layer (no UI)
- `src/api/types.ts`: TypeScript types matching the JSON exactly.
- `src/api/catalog.ts`: `getProducts(params)`, `getProduct(slug)`, `getFacets()` built on `apiFetch`; params → query string helper (omit empty values).
- Vitest tests for the query-string helper.

## 6. Small chore (timebox 15 min)
Try to make Vitest work from Git Bash on Windows (drive-letter casing issue from Task 07). If a clean config fix exists, apply it and remove the note from `CLAUDE.md`; otherwise leave the note and say what you tried.

## 7. Verify
- Standard checks from `CLAUDE.md` (incl. lint, Vitest).
- Locally against `dev` (`go run ./cmd/local`): show `curl` output (shortened) for: default listing (first 3 items), `platform=psn&sort=price_asc`, an invalid `sort` (400), product page of the Witcher product, unknown slug (404), facets. Show the `Cache-Control` headers.
- After opening the PR: CI green, then the same 3 requests against the **Preview URL** (it uses the `dev` DB, which is seeded identically).

## 8. Docs
- `README.md`: "API" section – table of endpoints, params, example request.
- `docs/PAAISKINIMAI_LT.md`: interface + fake for handler tests; why validation returns 400 instead of ignoring; `= ANY($1)` and SQL injection; `count(*) OVER ()`; why facets are global; `Cache-Control` / `s-maxage` / `stale-while-revalidate` and why staleness is safe (checkout re-checks); integration tests on the deterministic seed.

## Report
As defined in `CLAUDE.md` (incl. section 7 Self-review with the real `task-reviewer` subagent). Export the session log at the end and commit it on this branch.
