# Task 15 – Homepage built from backend blocks (+ footer "other projects", README "About the author")

**Model:** Opus · **Effort:** high
**Start only after Task 16a is merged** (its migration is `00005`; this task's migration must be the next number). Runs in parallel with Task 16b → use a worktree:
```
git worktree add ../ENEBA-homework-15 -b task/15-homepage origin/main
```
This PR has a **migration** → owner runs *Migrate production* from this branch before merging. Remove the worktree after the PR is opened.

## Goal
The assignment: *"The landing page is assembled from several different blocks, such as a banner, best sellers or deals. Each block gets its content from its own backend service or database, so the frontend only displays what it receives and nothing is hardcoded there."* Build it in Eneba's layout (compare with eneba.com's homepage at 1440/390, CLAUDE.md rule).

## Decisions (made by the owner – do not change)
- **H5 Block registry in the DB:** table `homepage_blocks` (`key`, `type`, `title`, `position`, `enabled`, `config jsonb` – e.g. sort/limit/"view all" link for product rows). `GET /api/homepage` returns the enabled blocks in order: `{ blocks: [ { key, type, title, endpoint } ] }`. The frontend has **one renderer per block type** and fetches each block from its own `endpoint` – it contains no block content, order or titles.
- **Each block has its own endpoint and data source** (logically separate services; README explains they could be split into real services):
  - **H1 hero** `GET /api/blocks/hero` – slides from table `homepage_slides` (`position`, `enabled`, `title`, `subtitle`, `badge`, `image_url`, `image_url_mobile`, optional `product_slug`, optional `cta_label` + `cta_href`). For a slide with `product_slug`, the endpoint adds the **live** cheapest price / in-stock flag from the catalog and the CTA goes to the product page.
    - Slide 1: **Innert** (a friend's game in development, used with the author's permission): title "INNERT", subtitle "Realms · Raids · Dragons", badge "Coming soon", **no button** (its repository is private – no dead links). Images: the owner's files in `C:\PROJEKTAI\ENEBA\innert\` – desktop `hero-3840x1240.png`, phone `key-art-clean-1920x1080.png` (fallback option `01-golden-hour-lake-3840x2160.png` if the hero is too light behind the text). Convert to **WebP** in a few widths (e.g. 1280/1920/2560 desktop, 768/1080 phone), aim ≤ 300 KB per file, put them in `public/banners/`. Do not commit the original PNGs.
    - Slides 2–3: two popular **in-stock catalog games** with a wide **IGDB artwork** (fetch the artwork `image_id`s once with the IGDB API locally – credentials only in `.env`; store the resulting `images.igdb.com` URLs, e.g. `t_1080p`, in the slide rows). Button "Buy now" → product page, price from the catalog.
  - **H2 side tiles** `GET /api/blocks/tiles` – table `homepage_tiles`: three tiles of **our own design** (text + a collage of 2–3 catalog covers or a token gradient – no Eneba artwork): "Up to −70%" → `/store?sort=discount`, "Steam games" → `/store?platform=steam`, "New releases" → `/store?sort=newest`.
  - **H3 platform row** `GET /api/blocks/platforms` – platforms with product counts from the catalog; **generic lucide icons**, no brand logos; links `/store?platform=…`; "All games" → `/store`.
  - **H4 product rows** `GET /api/blocks/products/{key}` – config from `homepage_blocks.config`; reuse the catalog listing query: **"Popular right now"** (popularity), **"Biggest discounts"** (discount), **"New releases"** (newest); 5 cards (Store `ProductCard`, incl. add-to-cart) + **"View all"** → the matching Store URL.
- **Content goes into the DB through the migration** (data rows in `00006`), **not through the seed**, so the catalog seed and its checksum do not change and production needs no reseed (production may already contain orders, and `seed --reset` refuses then).
- Every block endpoint: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`; errors `no-store`; 503/500 rules.
- **Resilience:** blocks load independently; a failing block shows a small error with Retry (or hides itself) while the others render.
- **Carousel:** arrows + dots, keyboard accessible, autoplay ~6 s that **pauses on hover/focus** and is **off with `prefers-reduced-motion`**; the first slide image is the LCP – load it eagerly with `fetchpriority="high"` and responsive `srcset`; no layout shift.
- **Not copied / no dead UI:** cashback, wishlist hearts, "Recommended for you" (we do not personalise), Eneba promo art, language/currency.
- **Footer:** add a line "Other projects by the author: **Kodmo Auto** – an offline management app for auto repair shops" linking to `https://kodmolab.lt/auto/` (`rel="noopener"`, opens in a new tab).
- **README:** section **"About the author"** (short): Kodmo Lab (https://kodmolab.lt) – a small software studio building practical, offline-first tools for small businesses; Kodmo Auto – an offline Windows app for auto repair shops in Lithuania (customers, jobs, parts inventory, staff; low-stock alerts), built with Python, PySide6, FastAPI and SQLite and developed end to end with AI coding tools (Claude Code) using the same small-task / spec / testing workflow as this project. Plus a note under the homepage section: Innert is a friend's game in development, its art is used with permission.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/15-homepage`, in the worktree).

## 2. Backend
Migration `00006` (via `cmd/migrate create`): the three tables + data rows. `pkg/homepage` (store + handlers behind small interfaces, injected via `Deps`), reusing `pkg/catalog` for prices, platforms and product rows. Update `docs/DATA_MODEL.md`.

## 3. Frontend
`src/pages/HomePage.tsx` + `src/features/home/` (block renderers: `HeroCarousel`, `SideTiles`, `PlatformRow`, `ProductRow`; a `BlockRenderer` that maps `type` → component and ignores unknown types). TanStack Query per block. Eneba layout (hero left + tiles right on desktop; stacked on phones; platform row scrolls horizontally on phones).

## 4. Tests
Go: handlers (order, disabled blocks hidden, live price on catalog slides, product-row config), integration (CI): `/api/homepage` order matches the table, toggling `enabled` hides a block, product rows return 5 items sorted as configured.
Vitest: renderer mapping (unknown type ignored), one failing block does not break the page, carousel (keyboard, pause on hover/focus, reduced motion), tiles/platform links.

## 5. Verify
Standard checks; real browser against the local API (`dev`): screenshots desktop + phone (hero, tiles, platform row, three rows, footer); Lighthouse: LCP image eager, CLS < 0.1; axe 0; turning one block's `enabled` off in `dev` removes it without a deploy (show it, then turn it back on); comparison table vs eneba.com.

## 6. Docs
`docs/PAAISKINIMAI_LT.md`: block registry and why the frontend has only renderers; why content is in a migration and not in the seed; per-block caching and resilience; carousel accessibility and LCP; IGDB artwork.

## 7. Owner steps (list in the report)
Before merge: *Migrate production* from `task/15-homepage` → `00006` applied. Then merge. No reseed needed.

## Report
As defined in `CLAUDE.md` (incl. comparison table, Self-review). Export the session log at the end and commit it on this branch.
