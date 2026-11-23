# Task 15 – Homepage built from backend blocks – report

Task file: [`docs/tasks/TASK_15_homepage.md`](../tasks/TASK_15_homepage.md) · Branch: `task/15-homepage` (from `main` after 16a and 16b were merged; the owner said to work in the main folder, so no worktree).

## 1. Files changed

**Backend**
- `migrations/00006_homepage.sql` (new, created with `go run ./cmd/migrate create homepage`): tables `homepage_blocks`, `homepage_slides` and `homepage_tiles` with CHECK constraints, plus the content rows (6 blocks, 3 slides, 3 tiles).
- `migrations/00007_homepage_live_discount.sql` (new, after the owner's review, created with `go run ./cmd/migrate create homepage_live_discount`): the discount tile's title becomes `Up to −{maxDiscount}%`. It is a new migration rather than an edit of 00006, because 00006 is already applied on `dev` (and maybe on production, if the pre-merge run has happened).
- `pkg/homepage/` (new):
  - `types.go`: the table rows and the JSON responses.
  - `config.go`: strict parsing of the jsonb settings and `Endpoint(block)`.
  - `store.go`: SQL reads; enabled rows only.
  - `service.go`: one method per block. It composes the tables with `pkg/catalog` (`ListProducts`, `GetProduct`) through the small `Content` / `Catalog` interfaces. After the review: `MaxDiscountToken` and `maxDiscount` (the live biggest discount on the tile).
  - Tests: `config_test.go`, `service_test.go`, `store_integration_test.go`.
- `pkg/server/homepage_handlers.go` (new): one shared `homepageHandler` with the caching, 404, 503 and 500 rules, behind the `HomepageReader` interface. Test: `homepage_handlers_test.go`.
- `pkg/server/router.go`: `Deps.Homepage`, plus the 5 routes (and a 405 for other methods).
- `api/index.go` and `cmd/local/main.go`: wire `homepage.NewService(homepage.NewStore(lazyDB), catalogStore)`.
- `.github/workflows/ci.yml`: the "integration tests really ran" step now includes `./pkg/homepage` and requires four homepage tests by name (the fourth, the live discount tile, was added after the review).

**Frontend**
- `src/pages/HomePage.tsx` + `.module.css`: reads the registry, lays the blocks out, and handles the loading, error and empty states.
- `src/features/home/` (new):
  - `BlockRenderer.tsx`: the type → renderer map; unknown types are skipped.
  - `BlockBoundary.tsx`: an error boundary per block.
  - `BlockError.tsx`: the small block error with Retry.
  - Renderers: `HeroCarousel.tsx`, `SideTiles.tsx`, `PlatformRow.tsx`, `ProductRow.tsx` (+ CSS modules).
  - `useCarousel.ts`, `blockTypes.ts`, `fixtures.ts`.
  - Tests: `HeroCarousel.test.tsx`.
- `src/api/homepage.ts` (+ test): `getHomepage`, plus `getBlock` with the endpoint guard.
- `src/api/types.ts` (home page types) and `src/api/queries.ts` (`homepageQuery`, `homeBlockQuery`).
- `src/lib/usePrefersReducedMotion.ts` (new) and `src/lib/appInfo.ts` (`KODMO_AUTO_URL`).
- `src/app/Footer.tsx`: the "Other projects by the author" line.
- `src/app/Layout.module.css`: a full-bleed page (`data-full-bleed-page`).
- `src/styles/tokens.css`: home page tokens (2.4 in DESIGN.md) and `--color-band`.
- `src/pages/HomePage.test.tsx` (new); `src/app/routes.test.tsx` updated (the home page now asks the API; footer test).
- `public/banners/innert-hero-{1280,1920,2560}.webp`, `innert-mobile-{768,1080}.webp` (49–133 KB; the PNG originals are not committed).

**Docs**
- `docs/DATA_MODEL.md`: "Home page tables".
- `docs/DESIGN.md`: 3.4 rewritten, S7, the tokens, contrast rows and research notes.
- `docs/PAAISKINIMAI_LT.md`: Task 15 sections.
- `README.md`: Home page section, About the author, layout list.
- `docs/tasks/TASK_15_homepage.md`, this report, `docs/reports/assets/task15_*.png` (9 screenshots).

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...` / `go vet ./...` / `go test ./...` | pass; `go.mod` untouched (`go 1.25.0`), no new Go or npm dependency |
| `npm run lint` | 0 problems |
| `npm test` (PowerShell) | **46 files, 573 tests pass**. New: 13 carousel tests, 10 home page tests, 8 block API tests; plus 1 new and 3 updated shell tests |
| `npm run build` | OK |
| Go unit tests (new) | config parsing (14 bad configs rejected), service (order, unknown type, live price + product link, unknown / out-of-stock product slide dropped, disabled block → `ErrNotFound`, tile covers distinct + filter, platform row, row config, bad config = error not 404), handlers (cache header on all 5, 404 `no-store`, 503 for 6 unreachable errors, 500 for 3 unexpected ones with nothing leaked, 405) |
| **GitHub CI on PR #19** (run 45149843110) | **green**: `go` (54 s), `frontend` (45 s), `migrations` (1 m 4 s; every migration up → down one by one → up again); Vercel Preview deployed. "Tests ran" step: `catalog + auth + orders + homepage tests: 171 passed, 0 skipped`; all 6 `TestHomepageIntegration_*` tests passed |
| DB integration tests | **ran in CI only** (no Postgres on this machine; 16a had the same limit), all passed. 6 tests: registry = table order (+ a reorder moves the block); toggling `enabled` hides the block and its endpoint is 404, then turning it on restores it; each row returns 5 items = the Store listing with the same sort, and the discounts are descending; hero prices = product page prices, and a 1-cent price change shows up live; platform counts = Store facet; the DB refuses 11 kinds of bad content |
| Tests can fail (mutation check) | Carousel ignoring hover/focus → 2 carousel tests fail. Removing the per-block error boundary → the "crashing block hides itself" test fails. Both restored |
| Migration on Neon **dev** | `go run ./cmd/migrate up` → `00006_homepage.sql` applied; all endpoints answered with real data (`curl`). After the review: `00007_homepage_live_discount.sql` applied; `/api/blocks/tiles` → **"Up to −73%"**, and the first card of `/api/products?sort=discount` has `discountPercent: 73` |
| **Review follow-up: live discount tile** | Unit tests: the token becomes the number in every tile that uses it, and the catalog is asked once (`sort=discount`, 1 item); the tile is left out with an empty catalog, no MSRP, a 0 % discount, or only out-of-stock products; a catalog error is an error. Integration test `TestHomepageIntegration_discountTileShowsTheLiveMaxDiscount` (CI): the tile = the Store's top discount, and halving that product's price makes the tile show the new, bigger number. Mutation check: allowing 0 % and asking the catalog per tile → both unit tests fail; restored. Frontend unchanged (it shows the title it gets); `npm test` still 573 passed |
| **Browser, real API** (`cmd/local` from this branch on 127.0.0.1:8095 → Neon dev; `vite preview` 127.0.0.1:4195) | Desktop 1440, phone 390 and tablet 768: no horizontal overflow; no console errors except the existing `401` of `/api/auth/me` when signed out |
| **Block on/off without a deploy** (dev) | `UPDATE homepage_blocks SET enabled=false WHERE key='discounts'` → page reload shows hero, tiles, platforms, Popular, New releases (no "Biggest discounts"; the bands re-stripe) → `enabled=true` → all 6 blocks back. Screenshot `task15_block-disabled-desktop.png`. The row is **on** again in dev |
| One failing block | `/api/blocks/tiles` answered with 500 (request interception): only the tiles slot shows "“Shortcuts” could not be loaded." + Retry; everything else renders (`task15_block-error-desktop.png`) |
| **axe-core** (WCAG 2 A/AA, 2.1 A/AA, best practice) | **0 violations** at 1440, 390 and 768, on each of the three slides (9 runs). "Incomplete" = colour contrast of text over images/gradients, measured separately below |
| Text contrast over the art (per pixel, worst pixel behind each text, 3 slides × 2 widths + tiles) | all pass: titles ≥ 3.55 (large text, needs 3), subtitles ≥ 6.86, "From" ≥ 4.55, prices ≥ 8.08, tile titles 13.47, tile subtitles ≥ 7.06 (DESIGN.md 5.1) |
| **Lighthouse desktop** | Performance 97, Accessibility 100, Best practices 96; **LCP 1.3 s, CLS 0**; LCP element = the Innert `<img>` with `loading="eager" fetchpriority="high"` + `srcset`; "LCP image lazy-loaded" passes |
| **Lighthouse mobile** (simulated slow 4G) | Performance 79, Accessibility 100; **LCP 5.0 s, CLS 0.001**; same LCP element. Lighthouse's "preload the LCP image" hint cannot be applied: the image URL arrives from the API (bundle → registry → hero block → image) |
| Loopback | everything on 127.0.0.1 (8095, 4195); scripts, the preview config, the IGDB/WebP/DB-toggle helpers and Eneba's reference screenshots stayed in the session scratchpad |

**Screenshots (ours):** `docs/reports/assets/task15_home-desktop.png` (full page), `task15_home-desktop-top.png`, `task15_home-mobile.png` (full page),
`task15_home-mobile-top.png`, `task15_home-tablet-top.png`, `task15_hero-product-slide-desktop.png`, `task15_hero-product-slide-mobile.png`,
`task15_block-error-desktop.png`, `task15_block-disabled-desktop.png`.

### Comparison with eneba.com (1440 / 390): Eneba → ours → still different, why

Reference: headless Edge, one load of `eneba.com/` per width, 2026-11-23 (S7 in DESIGN.md). Reference screenshots stay outside the repo.

| Eneba (measured) | Ours | Still different (why) |
|---|---|---|
| Full-bleed banner row under the header, 288px: main carousel 1008px + three 144 × 288 portrait tiles | **Same** (1008 × 288 + 3 × 144 × 288) | — |
| Banner text and buttons are part of the images | Real text (badge, 40px title, subtitle, live price, "Buy now") on a dark scrim | Text must come from the API and be accessible; our art has no baked-in text |
| Carousel controls | Arrows, dots, Play/Pause, ←/→ | Eneba's controls were not measured; Play/Pause is added for WCAG 2.2.2 |
| Tiles: Eneba promo art ("Black Friday", "Mega giveaway", "Games −90%") | Our own: text + a fan of catalog covers on token gradients ("Up to −73%" – the live biggest discount, "Steam games", "New releases") | Not copied (task rule) |
| Category row: 100 × 60 entries, 32px icon, 12px bold label, 50px below the banners | 100px entries, 32px icon, 12px bold label **+ product count** (so 103px tall), 40px below | Counts are asked for by the task; 40px is the nearest spacing token |
| Categories: Games, Gaming eCards, eGift Cards, Steam, PSN, Xbox (brand icons) | All games + 8 platforms with generic lucide icons | We sell only game keys; no brand logos (task rule) |
| Section heading 30px / 37.5px bold, cards 30px below, 5 cards × 222px | **Same** heading; 5 cards × 224px | 2px: our `--grid-gap` is 20px (Eneba ~22.5px here) |
| "See all" / "Show all": 194 × 35 outlined, centred, 40px under the cards | **"View all"** 194 × 35 outlined, centred at the same x (623), 40px under | Label from the task |
| Every second section on a darker full-bleed band `#311178` | **Same** (`--color-band`) | — |
| Sections: Recommended for you, Top games, gift cards, Upcoming games, Categories … | Popular right now, Biggest discounts, New releases | No personalisation, no gift cards (task rule / no such feature) |
| Cards with cashback badges and wishlist hearts | The Store's card (Add to cart / View offers) | No cashback or wishlist (no such feature) |
| 390: banners = one row of four 98 × 195 portrait cards | Carousel 390 × 219 (16:9, text at the bottom), then the 3 tiles in one row (130 × 144) | Task: "stacked on phones"; a real carousel with text needs a wider box |
| 390: category row 25px under the banners, sideways scroll | 20px under, sideways scroll | nearest token |
| 390: 20px headings, list cards, "See all" 194px centred | **Same** (20px, Store list cards, 194 × 40) | 40px button height on phones (tap-target rule) |
| "Black Friday" countdown popup, cookie / location popups, language/currency | none | Not copied / no such feature |

## 3. What the owner must do manually

1. **Before merging: Actions → Migrate production → Run workflow, "Use workflow from" = `task/15-homepage`.** Check that the log lists `00006_homepage.sql` **and `00007_homepage_live_discount.sql`** as applied, then merge. (If you already ran it for 00006, run it once more: only 00007 is applied.) **No reseed is needed**: the content rows come with the migration. Do not change the migration files after this run.
2. After the deploy: open the production home page, check that the six blocks are there, click a tile, a platform and "View all", and look at the hero on a phone.
3. Optional: try switching a block off in the Neon console (`UPDATE homepage_blocks SET enabled = false WHERE key = 'discounts';`). In production it disappears within ~5 minutes (CDN cache); switch it back on afterwards.
4. Export this session's log (`/export`) into `ai-logs/` (I will convert the transcript if the export is not available) – it is committed on this branch.

## 4. Plain-language explanation

The home page no longer knows what is on it. It asks the server one question: "which blocks do I show?" (`GET /api/homepage`). The answer comes from the database table `homepage_blocks`: a list of blocks in order, each with a type, a title and an address for its content. For each block the page has one "drawer" component for that type, and each block fetches its own content from its own address:
- the **carousel**: slides from `homepage_slides`, with the live price of a game taken from the catalog;
- the **tiles**: from `homepage_tiles`, with cover pictures from the catalog. The discount tile's number is live: the server puts in the biggest discount the Store has right now ("Up to −73%"), so it never goes out of date;
- the **platform row**: platform counts from the catalog;
- the **product rows**: the Store's own listing, with the sort and size taken from the block's settings.

So the order, the titles and the content can all change in the database without a new deploy. I showed that by switching a block off in `dev` and back on.

The blocks are independent. If one fails, only that block shows "could not be loaded" with a Retry button; if one crashes while drawing, it disappears and the rest of the page stays. The content was added by the migration and not by the seed: the seed's checksum stays the same, and production (which may already have orders) needs no reseed.

The carousel follows the accessibility pattern for carousels. It turns every 6 seconds, stops while you hover or focus it, and does not move at all if your system asks for reduced motion. The first picture is marked as the most important download on the page, and space for it is reserved before it loads, so nothing on the page jumps.

The footer now links to the author's Kodmo Auto app, and the README has an "About the author" section.

## 5. Deviations from the task and why

- **Two extra slide columns `image_srcset` and `image_srcset_mobile`.** The task's column list has one URL per crop, but it also asks for a responsive `srcset`. The widths are stored as ready `srcset` strings, so the frontend does not have to guess file names.
- **Play/Pause button in the carousel.** This is not in the task. It is needed for WCAG 2.2.2: moving content that starts by itself must be stoppable, and pausing on hover/focus alone is not enough for keyboard or touch users. It is the first control in the Tab order, as the WAI-ARIA carousel pattern asks.
- **Product slides that cannot be bought are skipped.** This applies to a product that is out of stock or no longer exists. The task says the API "adds the live in-stock flag"; I used that flag on the server to drop the slide, because "Buy now" for something you cannot buy would be dead UI. So the JSON has `priceCents`, which is only present on product slides, and no separate `inStock` field.
- **Handlers in `pkg/server`, store and service in `pkg/homepage`.** This is the existing pattern (orders: `pkg/orders` + `pkg/server/orders_handlers.go`), so the shared response helpers (`writeCached`, `storeFailed`) stay in one place. The handlers depend on the small `HomepageReader` interface, injected through `Deps`.
- **Phone layout.** On phones the carousel and the tiles stack, as the task says, instead of Eneba's single row of portrait cards. The carousel has no arrows on phones (the dots and Play/Pause are 40px targets, and the swipe gesture is not implemented).
- **No worktree.** The owner said to work in the main folder because 16b was already merged.
- **The discount tile's number is live, not a fixed "Up to −70%"** (the owner's decision after the first review; the task file keeps its original text). The API fills `{maxDiscount}` with the Store's current biggest discount. When nothing buyable is discounted, the tile is left out instead of showing "Up to −0%".

## 6. Open questions

None open. The owner's answers to the first version's questions:
1. **"Up to −70%" vs the real 73 %** → *make the number live, with a test.* **Done**: migration 00007 + `{maxDiscount}` (§1, §2).
2. **Several editions of one game in "Popular right now"** → *keep the rows as they are* (Eneba shows several editions too). No change.
3. **Swipe on phones** → *comes in Task 17.* No change here.

## 7. Self-review (`task-reviewer` subagent)

**Verdict: PASS.** All 20 implementation requirements were marked done with evidence. The open items were the report and the session log, which this task schedules after the review. No CLAUDE.md violations were found. The reviewer checked: one Go file in `/api`, logic in `pkg/`, no `godotenv` outside `cmd/`, `go.mod` unchanged, no raw `fetch`, generic client errors, integer cents, tokens only in the home page CSS (only the 600/930 breakpoints are used), migration 00006 expand-only, DATA_MODEL updated, seed untouched, no secrets, noreply commits.

What was done about each finding:
| Finding | Action |
|---|---|
| Play/Pause button not asked for (WCAG 2.2.2 addition) | Kept; listed in 5. Deviations |
| `image_srcset` / `image_srcset_mobile` extra columns | Kept; listed in 5. Deviations and in DATA_MODEL.md |
| README "Layout" listed `pkg/homepage/` among the frontend lines | **Fixed** (moved next to `pkg/catalog/`) |
| Report missing; Lighthouse / axe / CLS figures only in the docs | **Done**: this report, §2 has the raw figures |
| Verification commands must be run and stated (the reviewer is read-only) | Done: §2 (`gofmt`, build, vet, test, lint, Vitest from PowerShell, build) |
| Session log not committed yet | Committed on this branch as the last step |
| Worktree instruction cannot be verified | Not used, on the owner's instruction (5. Deviations) |

**Second pass, after the owner's answers (live discount tile): verdict CHANGES NEEDED, report only.** The reviewer found the implementation complete and tested. It found no scope creep and no CLAUDE.md violations: 00007 is a new, expand-only migration and 00006 is unchanged. Product rows and the carousel are untouched (answers 2 and 3). The `fixtures.ts` / `HomePage.test.tsx` "Up to −70%" is correct, because the frontend shows whatever title the API sends. Its findings were all about this report, which it read before it was updated:
| Finding | Action |
|---|---|
| §1 does not list 00007, the `service.go` change or the new tests | **Fixed** (§1) |
| §2 figures predate the new commits; CI must be re-run | **Fixed**: local checks re-run (§2, "Review follow-up" row); CI on the new head recorded in the CI row |
| Comparison table still says "Up to −70%" | **Fixed** |
| §3 must say 00006 **and** 00007, and run the workflow again if it already ran for 00006 | **Fixed** (§3 step 1) |
| §6 questions are answered | **Fixed**: §6 records the answers |
| §4 / §5 should mention the live number and the left-out tile | **Fixed** |
| Session log converted before the review round | Re-converted at the end of this round and committed |
