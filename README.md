> **Disclaimer & Attribution:** This repository is a non-commercial portfolio and internship assignment project demonstrating marketplace UI and architecture. It is not affiliated with, endorsed by, or connected to Eneba (JSC "Helis play"). Authentication and checkout are strictly simulated – no real payments, user credentials, or digital keys are processed or issued. Game metadata and cover images are provided by IGDB under the Twitch Developer Service Agreement for non-commercial use. All product names, logos, brands and artwork remain the property of their respective owners.

# EneHomeworkBa – an Eneba-style game-key marketplace

A digital game-key shop in the style of eneba.com: home page built from backend blocks, store with filters, typo-tolerant search,
product pages, cart, sign-in and a simulated checkout that hands out (fake) keys. React + TypeScript, a Go API on Vercel, Postgres on Neon.

**Live demo: <https://enehomeworkba.vercel.app>**

- No account needed: open *Sign in* → **"Sign in as demo user"** (every click creates a fresh demo account, so you only see your own orders).
- Checkout: on the payment page choose **Decline** (the order stays payable) or **Success** (the order is paid and shows its `DEMO-…` keys).
- The first request after a quiet period can take a few seconds (serverless cold start + the database waking up). The page then shows *"Waking up the server, this can take a few seconds…"*.

**Contents:** [Screenshots](#screenshots) · [The assignment, part by part](#the-assignment-part-by-part) ·
[Purchase flow](#purchase-flow-in-depth) · [Search](#search-in-depth) · [Architecture](#architecture) · [Quality](#quality) ·
[Scope and shortcuts](#scope-and-shortcuts-honest-list) · [Run it locally](#run-it-locally) · [Built with AI](#how-this-project-was-built-with-ai) ·
[Reference](#reference) · [About the author](#about-the-author) · [Credits](#credits)

## Screenshots

Desktop (1440 px):

| Home | Store | Product |
|---|---|---|
| <img src="docs/screenshots/home-desktop.png" alt="Home page: hero carousel, side tiles, platform row" width="300"> | <img src="docs/screenshots/store-desktop.png" alt="Store: filter sidebar and product grid" width="300"> | <img src="docs/screenshots/product-desktop.png" alt="Product page: buy box and offers" width="300"> |
| **Cart** | **Payment (simulated)** | **Order with keys** |
| <img src="docs/screenshots/cart-desktop.png" alt="Cart page" width="300"> | <img src="docs/screenshots/payment-desktop.png" alt="Payment page with Success / Decline" width="300"> | <img src="docs/screenshots/order-desktop.png" alt="Paid order with masked keys" width="300"> |

Phone (390 px):

| Home | Store | Product | Order |
|---|---|---|---|
| <img src="docs/screenshots/home-mobile.png" alt="Home on a phone" width="160"> | <img src="docs/screenshots/store-mobile.png" alt="Store on a phone" width="160"> | <img src="docs/screenshots/product-mobile.png" alt="Product on a phone" width="160"> | <img src="docs/screenshots/order-mobile.png" alt="Order on a phone" width="160"> |

All pages at both sizes: [`docs/screenshots/`](docs/screenshots/).

## The assignment, part by part

| Requirement | How it is met | Where to look |
|---|---|---|
| **Store** | Catalog of 108 products (50 real games from IGDB × platforms × regions, 8 fictional sellers). Filters (platform, region, price slider), 7 sorts, pagination. The URL holds every filter, so a filtered page can be shared and Back works. Facet counts follow the other active filters. | `/store` · [`StorePage.tsx`](src/pages/StorePage.tsx), [`src/features/store/`](src/features/store/), [`pkg/catalog/store.go`](pkg/catalog/store.go) |
| **Homepage** – *"assembled from several different blocks… each block gets its content from its own backend service or database, so the frontend only displays what it receives"* | A **block registry** table (`homepage_blocks`: type, order, on/off, config) → `GET /api/homepage`. Each block has **its own endpoint** (`/api/blocks/hero`, `/tiles`, `/platforms`, `/products/{key}`) and its own query in the browser. The content (slides, tiles, rows) **lives in the database**: switching a block off is an `UPDATE`, no deploy. The frontend has one renderer per block type and no content. The blocks share one Go function today, but they only meet in the registry, so each **could be split into its own service** by changing its endpoint URL. | `/` · [`HomePage.tsx`](src/pages/HomePage.tsx), [`src/features/home/`](src/features/home/), [`pkg/homepage/`](pkg/homepage/), [`migrations/00006_homepage.sql`](migrations/00006_homepage.sql) |
| **Search** | Header search with live suggestions (one row per game, keyboard + screen reader friendly), and full results in the Store (`/store?q=…`, "Best match" sort). Finds titles **and nicknames** (`gta`, `rdr2`) and tolerates typos (`witchr 3`). [More below.](#search-in-depth) | header · [`SearchBox.tsx`](src/features/search/SearchBox.tsx), [`pkg/catalog/search.go`](pkg/catalog/search.go) |
| **Product page** | Game info, buy box with the cheapest offer, all sellers' offers (cheapest first, seller rating), other versions of the game, out-of-stock state, add to cart with a toast. | `/product/…` · [`ProductPage.tsx`](src/pages/ProductPage.tsx), [`src/features/product/`](src/features/product/) |
| **Checkout** | Cart in the browser → server re-prices it → order with keys **reserved for 15 minutes** → simulated payment → keys shown (masked until "Reveal"). Order history. [More below.](#purchase-flow-in-depth) | `/cart`, `/checkout/…`, `/orders` · [`src/features/checkout/`](src/features/checkout/), [`pkg/orders/`](pkg/orders/) |
| **Authentication** | Email + password accounts (argon2id), HttpOnly session cookie (only its SHA-256 is stored), CSRF `Origin` check, DB-backed sign-in rate limit, one-click demo user, protected pages with `?next=` return. | `/login`, `/register` · [`pkg/auth/`](pkg/auth/), [`pkg/server/auth_handlers.go`](pkg/server/auth_handlers.go), [`src/features/auth/`](src/features/auth/) |
| **Eneba styling** | Eneba's colors, font (Metropolis, free) and spacing were measured into design tokens ([`tokens.css`](src/styles/tokens.css), documented in [`docs/DESIGN.md`](docs/DESIGN.md)). Since Task 11b every UI task ended with a side-by-side comparison against eneba.com at 1440 and 390 px; each report lists what still differs and why. **Not copied on purpose:** Eneba's logo, icons, images, illustrations and texts (the wordmark is our own), and features we do not have (see [scope](#scope-and-shortcuts-honest-list)). | [`docs/DESIGN.md`](docs/DESIGN.md), e.g. [Task 11b report](docs/reports/TASK_11b_visual_parity.md) |

## Purchase flow (in depth)

```mermaid
sequenceDiagram
    autonumber
    actor B as Buyer (browser)
    participant API as Go API (Vercel function)
    participant DB as Postgres (Neon)
    B->>API: POST /api/checkout/quote (cart lines with the prices the buyer saw)
    API->>DB: current price, stock and state of every offer
    API-->>B: lines + changes (price_changed, quantity_reduced, unavailable)
    B->>API: POST /api/orders (idempotencyKey + items)
    Note over API,DB: ONE transaction
    API->>DB: lock the user row, at most 3 unpaid orders, re-check every price
    API->>DB: SELECT keys FOR UPDATE SKIP LOCKED, reserved for 15 min
    API-->>B: 201 pending order (same idempotencyKey again: 200, the same order)
    B->>API: POST /api/orders/{id}/pay outcome=decline
    API-->>B: 402 declined, the order stays pending
    B->>API: POST /api/orders/{id}/pay outcome=success
    API->>DB: lock the order, still pending and not expired, keys become sold, payment row
    API-->>B: 200 paid order with its key codes
```

- **The server is the truth.** The browser's prices are only *compared*. If anything changed, no order is created and the `409` lists every line with its change, so the cart can show it.
- **No double selling.** Keys are taken with `SELECT … FOR UPDATE SKIP LOCKED` inside the order transaction: two buyers never get the same key and never wait for each other. Either the order, its items and *all* its keys exist, or nothing does.
- **Proven by a race test:** `TestK6_twoBuyersOneLastKey` fires two buyers at the last key at the same moment on a real Postgres, many times: exactly one order, the other buyer is told the cart changed. `TestK6_manyBuyersFewKeys`: 10 buyers, 4 keys → exactly 4 orders. ([`store_integration_test.go`](pkg/orders/store_integration_test.go))
- **Idempotency.** Each checkout attempt carries a UUID; `UNIQUE (user_id, idempotency_key)` makes a retried or doubled request return the same order instead of reserving twice. Paying a paid order returns it unchanged; a partial unique index allows only one successful payment per order.
- **Lazy expiry.** No background job: a pending order past `reservedUntil` is *shown* as expired, its keys count as available again, and paying too late answers `409` and frees them.
- **Unpaid-order cap.** At most 3 pending, unexpired orders per user, checked inside the create transaction after locking the user row (8 parallel creates → exactly 3 orders). Stops one account from hoarding keys.
- **Another user's order is `404`**, exactly like an unknown id: the API does not even confirm that the order exists. Key codes appear only in a paid order and only for its owner.
- **Time is injectable** (`Store.WithClock`), so the 15 minutes are tested without sleeping.

All business rules are pure functions in [`pkg/orders/rules.go`](pkg/orders/rules.go) (R1–R10, unit-tested); the SQL is in [`pkg/orders/store.go`](pkg/orders/store.go). Data model and state machines: [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

## Search (in depth)

- **Nicknames from IGDB.** Players type "gta 5", "rdr2", "hzd". No fuzzy match can connect "gta" to "Grand Theft Auto V", so the seed stores IGDB's alternative names (plus 3 hand-written ones) in `game_aliases` – 134 aliases for the 50 games.
- **Contains or similar.** A title or alias matches when it *contains* the query (`ILIKE '%q%'`) **or** is similar enough by trigrams: `word_similarity(q, term) ≥ 0.55`, which compares the query with the best-matching *part* of a long title (`witchr 3` vs "The Witcher 3: Wild Hunt" = 0.58). Both conditions use GIN trigram indexes.
- **Threshold 0.55, tuned with a query table.** Postgres' default 0.6 missed `witchr 3` and `halflife` (0.58); 0.5 let `the witcher` find *Zelda: Breath of the Wild* (0.50). The table of real queries is in the [Task 13a report](docs/reports/TASK_13a_search_backend.md#threshold-tuning-query--top-3-real-storesuggest-on-the-seeded-data); its top results are assertions in a CI test. The threshold is set per transaction (`set_config(…, true)`), so it cannot leak through PgBouncer.
- **Two-letter queries match word starts only:** `re` finds *Red Dead Redemption*, not *Dishonored*.
- **Relevance ranking:** exact title > prefix > contains > typo-only, then similarity, then popularity.
- **Suggestions: one row per game** (its cheapest in-stock version), with "Also known as GTA 5" when a nickname matched, and the typed part highlighted.
- **Accessible combobox** (ARIA 1.2): arrows move the active row (`aria-activedescendant`), Enter opens it, Esc closes then clears, the number of results is announced. Requests are debounced (200 ms) and an old, slow answer can never replace a newer list.

SQL and index details: [`docs/DATA_MODEL.md`, sketch 4](docs/DATA_MODEL.md#4-search-title--aliases-typos-allowed-task-13a-pkgcatalogsearchgo).

## Architecture

```mermaid
flowchart LR
    U["Browser<br/>React SPA"] -->|HTTPS| CDN["Vercel CDN<br/>static files + cached GET answers"]
    CDN -->|"/api/* not cached"| F["Go function api/index.go<br/>region fra1"]
    F -->|"pgx pool, DATABASE_URL<br/>pooled (PgBouncer)"| DB[("Neon Postgres<br/>production branch")]
    GH["GitHub Actions"] -->|"migrate / seed production<br/>DATABASE_URL_DIRECT"| DB
    GH -->|"CI on every PR:<br/>go, migrations, frontend"| PR["Pull request"]
    PR -->|"Preview deploy<br/>(Neon dev branch)"| CDN
```

| Decision | Why |
|---|---|
| **Go API as one Vercel serverless function** | One deploy for frontend and API, free hosting, no server to run. `api/index.go` only forwards to a standard `net/http` router, so the same router runs locally (`cmd/local`). Function region `fra1` sits next to the Neon database (Frankfurt). |
| **Go code in `pkg/`, not `internal/`** | Vercel builds `api/index.go` as a separate package, and Go's `internal` rule then breaks the build. |
| **pgx + hand-written SQL (no ORM)** | The interesting queries (facets, trigram search, `SKIP LOCKED` reservation) are plain SQL that can be read, `EXPLAIN`ed and tested. Pooled connection (PgBouncer, transaction mode) for the app; direct connection only for migrations and seeding. |
| **goose migrations, embedded in the binary** | Numbered SQL files with Up and Down. CI runs every Up *and* Down on a clean Postgres. Production is migrated only by GitHub Actions, *before* the code that needs it is merged (expand/contract). |
| **TanStack Query** | Caching, deduplication, retries and prefetching of server data without hand-written effects. Links prefetch on hover/focus/touch, so most clicks open an already-loaded page. |
| **CSS Modules + design tokens** | Plain CSS scoped per component; every color/size comes from `tokens.css`, so the Eneba look is defined in one place. No UI library, no Tailwind. |
| **Cookie sessions + argon2id** | An HttpOnly cookie cannot be read by injected scripts (unlike a token in `localStorage`); argon2id is the OWASP-recommended password hash. |
| **Money in integer cents** | No floating-point rounding errors; formatting is the frontend's job. |

Database: [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) (ER diagram: game → product → offer → key, orders, auth, home page tables; state machines; query sketches). Look and components: [`docs/DESIGN.md`](docs/DESIGN.md).

## Quality

**CI on every pull request** ([`ci.yml`](.github/workflows/ci.yml)), three required jobs:

| Job | What it proves |
|---|---|
| `go` | `gofmt`, `go vet`, `go build`, `go test -race` |
| `migrations` | every migration Up on a clean Postgres 18, then every Down one by one back to version 0, then Up again; then the **database integration tests** on the deterministic seed (they *fail* instead of skipping when the database is missing) |
| `frontend` | ESLint, Vitest, TypeScript + production build |

**Tests:** **226 Go test functions** (151 unit tests + 75 database integration tests that run in CI against Postgres) with 445 table-driven subtests, and **628 frontend tests** in 50 files (Vitest + Testing Library). Counted on 2026-11-24.

**Lighthouse (mobile)** – default mobile preset: Moto G Power emulation, simulated slow 4G (150 ms RTT, 1.6 Mbps), 4× CPU slowdown; median of 3 runs.

| Page | Local build (Task 17): score / LCP / CLS | **Production** (2026-11-24): score / LCP / CLS / TBT |
|---|---|---|
| Home `/` | 95 / 2.68 s / 0 | **97 / 2.29 s / 0 / 89 ms** (runs: 4.64, 2.28, 2.29 s) |
| Store `/store` | 95 / 2.58 s / 0.002 | **98 / 2.07 s / 0.002 / 91 ms** (2.07, 2.07, 1.98 s) |
| Product | 97 / 2.47 s / 0 | **98 / 2.07 s / 0 / 41 ms** (1.92, 2.07, 2.08 s) |

*Local:* `vite preview` (gzip, HTTP/1.1) on 127.0.0.1 + the Go API on 127.0.0.1 talking to Neon over the internet, no CDN (details in the [Task 17 report](docs/reports/TASK_17_polish.md)).
*Production:* <https://enehomeworkba.vercel.app> (Brotli, HTTP/2, Vercel CDN, function in `fra1`), Lighthouse 12.8.2 in headless Edge on a Windows PC over a home internet connection (nearest Vercel edge: Stockholm); each page loaded once before the 3 counted runs so the function and the CDN were warm. Home's first run (4.64 s) was slower, so the median of 3 is used. The product page is `/product/grand-theft-auto-v-steam-global`.

**Accessibility:** axe-core (WCAG 2.0/2.1 A + AA and best practices) – **0 violations** in 22 local runs (11 pages × 1440/390 px, Task 17) and in 16 runs on production (8 public pages × 2 sizes, 2026-11-24). Keyboard: skip link, visible focus ring, focus trap in drawers, focus + title announcement on every page change, carousel pause/arrow keys, `prefers-reduced-motion` respected. Text/background contrast pairs are computed in [`DESIGN.md` §5](docs/DESIGN.md#5-accessibility).

**Security notes:**
- **CSRF:** `SameSite=Lax` cookie plus an `Origin` check on every state-changing request (foreign or missing `Origin` → `403`).
- **Sign-in rate limit** stored in the database (works across serverless instances); the same error text for a wrong email and a wrong password, and a dummy hash so the response time does not reveal which emails exist.
- **No card fields anywhere** – the payment is a Success/Decline choice; nothing that looks like a real checkout can collect card data.
- **`noindex`** meta + `robots.txt` `Disallow: /` + a demo banner on every page, so the shop cannot be mistaken for a real one.
- **Secrets never in the repo:** `.env` is git-ignored; connection strings live in Vercel / GitHub secrets; migration and seed tools never print the host, user or password (Actions logs are public). The git history was scanned for connection strings, Neon passwords, IGDB credentials and e-mail addresses before submission ([Task 18 report](docs/reports/TASK_18_readme_submission.md)).
- Raw database errors never reach the client (generic message; `503` when the database is unreachable).

## Scope and shortcuts (honest list)

What is simplified, and what a real shop would do:

- **Payment is simulated** (Success / Decline). Real: a payment provider with webhooks, idempotent payment intents, refunds.
- **No email verification, password reset or "sign out everywhere".** Real: signed, single-use, expiring email links.
- **The sign-in rate limit counts per email**, so a stranger can pause password sign-in for an email for 15 minutes (nothing leaks; signed-in sessions and the demo button keep working). Real: count per **email + IP** and add a slow-down or CAPTCHA.
- **Demo accounts and their orders are never cleaned up.** Real: a scheduled job.
- **The home page "services" are logical, not separate deployments:** separate endpoints and tables in one Go function and one database.
- **EUR only.** Real: a currency next to every amount and the FX rate on the order.
- **Key codes are not encrypted at rest** (they are fake `DEMO-…` codes). Real: envelope encryption with a KMS key, decrypted only for the buyer.
- **Going Back from the payment page and pressing Checkout again creates a second pending order**; the first one keeps its keys until it is paid, cancelled or expires (15 min). The cap of 3 unpaid orders limits this. Real: reopen the existing pending order.
- **No rate limit on the checkout endpoints** (only the 3-unpaid-orders cap).
- **Expiry is lazy** – nothing runs in the background; an expired order stays `pending` in the table until it is read or touched.
- **The cart is a page only** (no header popup), and "Cancel order" has no confirmation step (nothing is lost: the cart stays).
- **Cheapest price and stock are computed per request**, and pagination uses `OFFSET` – correct and fast at 108 products; at scale: a precomputed table or a search engine, and keyset pagination.
- **Re-seeding the catalog refuses while orders exist** (order history is never deleted by a seed). `cmd/seed --aliases-only` exists for the one case that happened: production missed the search aliases (Task 18).
- **Home LCP on a throttled phone is 2.29 s on production but 2.68 s in the local measurement** (target 2.5 s); the next step would be a prerendered shell, which was not worth the complexity here.

**Intentionally not built** (Eneba has them; they would be fake without real data): wishlist, cashback, reviews and ratings by buyers, "people watching" counters, query-text suggestions, categories / genre pages and their filters, language and currency switcher, social sign-in, avatars and profile pages, gift cards, promo pop-ups and countdowns, Trustpilot and payment-method strips, seller accounts and key upload.

## Run it locally

Prerequisites: **Go 1.25+** (see `go.mod`), **Node 24** (`.nvmrc`), and a Postgres database – the project uses a [Neon](https://neon.tech) branch (`dev`), with a *pooled* and a *direct* connection string.

```bash
npm install
cp .env.example .env            # fill in DATABASE_URL (pooled) and DATABASE_URL_DIRECT (direct)

go run ./cmd/migrate up         # create the schema
go run ./cmd/seed               # fill the catalog from the committed IGDB snapshot (deterministic)

go run ./cmd/local              # terminal 1: Go API on 127.0.0.1:8080 (-port to change)
npm run dev                     # terminal 2: Vite on 127.0.0.1:5173, proxies /api to 127.0.0.1:8080
```

Open <http://127.0.0.1:5173>. Both servers listen on **127.0.0.1 only**. Quick check: `curl 127.0.0.1:8080/api/health` → `{"status":"ok","db":"ok","dbLatencyMs":…}`.

**Checks** (the same as CI):

```bash
gofmt -l .                      # must print nothing
go vet ./... && go build ./... && go test ./...
npm run lint && npm test && npm run build
```

`go test ./...` **skips** the database integration tests unless `TEST_DATABASE_URL` points to a **throw-away** Postgres (never a Neon branch – the tests reset the catalog), e.g. `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:18`, then
`TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable go test -p 1 ./...` (`-p 1`: the packages share the database and must run one after another).
On Windows run `npm test` from PowerShell (Vitest fails from Git Bash because of the lower-case drive letter; see `CLAUDE.md`).

## How this project was built with AI

```text
planning chat (Claude)            Claude Code (in the repo)                      owner
─────────────────────             ─────────────────────────                      ─────
strategy, architecture  ──task──▶ branch task/NN-name                    
task file per step       file     task file committed verbatim (docs/tasks/)
                                  code + tests + docs in small commits
                                  task-reviewer subagent (checks the branch
                                    against the task and CLAUDE.md)
review of the report +  ◀──PR──── PR with report (docs/reports/) + CI     ──▶ tests the Vercel Preview,
code on GitHub against                                                        answers open questions,
the task file, before                                                         migrates production, merges
the owner merges
```

- **25 tasks**, from the project skeleton to the final audit: [`docs/tasks/`](docs/tasks/). Each has a report with files changed, verification output, manual steps, a plain-language explanation, deviations, open questions and the reviewer subagent's findings: [`docs/reports/`](docs/reports/).
- **22 pull requests** (Tasks 01–02 were committed before the PR workflow existed; it was introduced in Task 03), **254 commits on `main` before the last task (Task 19)**. Since Task 07 every PR needs green CI before it can be merged.
- **Standing rules for the AI:** [`CLAUDE.md`](CLAUDE.md) – structure, database, migration, UI, workflow and reporting rules, grown task by task when something went wrong.
- **Claude Code sessions:** [`ai-logs/`](ai-logs/) – one log per session (23 files), converted from the session transcripts and redacted (no connection strings, e-mails or user names).
- **The planning chat:** https://claude.ai/share/OWNER_FILLS_IN
- **Before the planning chat:** before this repository and the planning chat existed, a short earlier conversation with Claude chose the stack and the hosting. It also covered the owner's personal job search, so it is not shared. Its decisions were written into the first version of the planning context that starts the shared planning chat. Everything after that is in the shared planning chat and in [`ai-logs/`](ai-logs/).

**Who did what.** The AI (Claude) wrote almost all of the code, tests and documentation: Claude Code in the repository, guided by task files that were drafted in a planning chat with Claude. The owner decided what to build and how far to go (every "Owner's answer" in the reports is such a decision: e.g. Eneba's side drawer instead of a full-screen one, the per-email rate limit, the cap of 3 unpaid orders), reviewed each report against the task and the code, tested the Preview deployments by hand (the manual checklist in each report), ran the production migrations and seeds, and merged. Before each merge the planning chat also reviewed the report **and the code on GitHub** against the task file. The checks that keep the AI honest are mechanical: CI on every PR, a separate reviewer subagent and measured numbers (Lighthouse, axe, query tables) in every report. [`docs/PAAISKINIMAI_LT.md`](docs/PAAISKINIMAI_LT.md) is not the owner's own writing: Claude Code wrote these Lithuanian explanations of every important file for the owner, and the owner used them to learn and check the code.

## Reference

<details>
<summary><b>Catalog and search API</b> (<code>/api/products</code>, <code>/api/products/{slug}</code>, <code>/api/search/suggest</code>)</summary>

JSON, `camelCase` field names. Money is **integer cents**. Errors are always `{"error":"..."}`; an unreachable database gives `503` and any other unexpected error `500`, both with a generic message (never SQL or driver text).

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | API + DB status: `{"status":"ok","db":"ok","dbLatencyMs":37}` or `503` |
| `GET /api/products` | Store listing: `items`, `total`, `page`, `pageSize` and `facets` (filter options with counts) |
| `GET /api/products/{slug}` | Product page: `product`, `game`, `offers` (buyable, cheapest first), `variants` (other versions of the game). Unknown slug → `404` |
| `GET /api/search/suggest?q=…` | Up to 6 games for the search dropdown, best match first, **one item per game** |

**`GET /api/products` query parameters** (all optional; unknown names are ignored):

| Parameter | Meaning |
|---|---|
| `q` | Search text: game **title or alias** ("gta 5", "rdr2"), contains or typo match (`witchr 3`). Trimmed, 2–100 characters. A 2-character query matches only at the start of a word. Filters the items **and** the facets |
| `platform`, `region` | Comma-separated slugs: `platform=steam,psn`. Unknown slugs match nothing |
| `minPrice`, `maxPrice` | Integer cents ≥ 0, `minPrice ≤ maxPrice`. Uses the cheapest *in-stock* price |
| `sort` | `popularity` (default without `q`) · `relevance` (default with `q`) · `price_asc` · `price_desc` · `discount` · `newest` · `title` |
| `page`, `pageSize` | `page` ≥ 1; `pageSize` 1–48 (default 24) |

An invalid value (`sort=cheapest`, `pageSize=100`, `minPrice=-1` …) is answered with `400` and a clear message, never silently ignored. A `price` of `null` means *out of stock*. `cheapestOffer` (`offerId`, `stock`, `sellerName`, or `null`) is the offer a card's "Add to cart" adds – always the first offer on the product page.

**Facets** follow the current filters: each group (`platforms`, `regions`) is counted with all *other* active filters applied but not its own, so the other options of a group keep their counts. `priceRange` covers the in-stock products that match the platform/region filters.

```bash
curl "127.0.0.1:8080/api/products?platform=steam&region=global&sort=price_asc&pageSize=2"
```
```json
{
  "items": [{"slug": "portal-steam-global", "title": "Portal", "edition": "Standard",
             "platform": {"slug": "steam", "name": "Steam"}, "region": {"slug": "global", "name": "GLOBAL"},
             "coverUrl": "https://images.igdb.com/…", "priceCents": 549, "msrpCents": 1999, "discountPercent": 72,
             "offerCount": 2, "inStock": true,
             "cheapestOffer": {"offerId": 412, "stock": 5, "sellerName": "Pixel Vault"}}, "…"],
  "total": 43, "page": 1, "pageSize": 2,
  "facets": {
    "platforms": [{"slug": "steam", "name": "Steam", "count": 43}, {"slug": "psn", "name": "PSN", "count": 8}, "…"],
    "regions":   [{"slug": "global", "name": "GLOBAL", "count": 43}, {"slug": "europe", "name": "EUROPE", "count": 6}, "…"],
    "priceRange": {"minCents": 549, "maxCents": 5099}
  }
}
```
*(shortened; real output from the seeded `dev` database.)* The `platforms` counts describe the *region* filter but not the platform filter: Steam is selected, yet PSN still shows its 8 products.

Suggestion item: `{"gameTitle", "productSlug", "edition", "platform", "region", "coverUrl", "priceCents" | null, "inStock", "matchedAlias" | null}`; `productSlug` is the game's cheapest in-stock product; `matchedAlias` is set when an alias matched and the title did not.

**Caching.** Successful catalog responses carry `Cache-Control` so the Vercel CDN can answer without calling the function: listing `public, s-maxage=60, stale-while-revalidate=300`, product page `s-maxage=15, stale-while-revalidate=60`, suggestions `s-maxage=300, stale-while-revalidate=600`; errors `no-store`. Short staleness is safe because browsing never decides money: checkout re-checks stock and price in the database.

Typed frontend functions: [`src/api/catalog.ts`](src/api/catalog.ts), types in [`src/api/types.ts`](src/api/types.ts).
</details>

<details>
<summary><b>Home page blocks</b> (<code>/api/homepage</code>, <code>/api/blocks/…</code>)</summary>

| Endpoint | Data source | Answers |
|---|---|---|
| `GET /api/homepage` | `homepage_blocks` (+ slides and catalog for the preload hint) | `{"blocks":[{"key","type","title","endpoint"}],"preload":{"heroImage":{…}\|null}}` |
| `GET /api/blocks/hero` | `homepage_slides` + the catalog (live price of a product slide) | `{"slides":[{id,title,subtitle,badge,image,cta\|null,priceCents\|null}]}` |
| `GET /api/blocks/tiles` | `homepage_tiles` + the catalog (up to 3 covers per tile) | `{"tiles":[{id,title,subtitle,href,accent,coverUrls}]}` |
| `GET /api/blocks/platforms` | the catalog (platform facet) + the block's icon config | `{"items":[{key,label,count,href,icon}]}` |
| `GET /api/blocks/products/{key}` | the Store query, configured by the block row (`sort`, `limit`, `viewAllHref`) | `{"items":[Item],"viewAllHref"}` |

- The frontend ([`src/features/home/`](src/features/home/)) has one renderer per type (`hero`, `tiles`, `platforms`, `product_row`) and fetches each block from its own `endpoint`; an unknown type is skipped.
- Content is inserted by migration `00006` (not by the seed). Switching a block off: `UPDATE homepage_blocks SET enabled = false WHERE key = 'discounts';` – it disappears without a deploy (in production after the 5-minute CDN cache).
- Caching: `public, s-maxage=300, stale-while-revalidate=600`; errors `no-store`.
- Resilience: a failing block shows "could not be loaded" + Retry in its own place; a block that crashes while drawing hides itself (error boundary per block).
- Hero carousel: arrows, dots, Play/Pause, Left/Right keys, swipe; autoplay every 6 s, paused on hover/focus, off with `prefers-reduced-motion`. The first slide's picture is preloaded from the registry's hint (LCP).
- Slides: 1. **Innert** – a friend's game in development, art used with the author's permission ([`public/banners/`](public/banners/)); 2.–3. Grand Theft Auto V and The Witcher 3 with IGDB artworks and the live price.
</details>

<details>
<summary><b>Accounts and sign-in</b> (<code>/api/auth/…</code>)</summary>

| Endpoint | Body | Answers |
|---|---|---|
| `POST /api/auth/register` | `{"email","password"}` | `201 {"user"}` + session cookie · `400` (password 8–128 characters) · `409` email taken |
| `POST /api/auth/login` | `{"email","password"}` | `200 {"user"}` + cookie · `401` "Invalid email or password" (same text for every reason) · `429` + `Retry-After` after 10 failures for that email in 15 minutes |
| `POST /api/auth/logout` | – | `204`, cookie cleared |
| `POST /api/auth/demo` | – | `201 {"user"}` + cookie: a **new** demo account `demo-<random>@demo.invalid` without a password |
| `GET /api/auth/me` | – | `200 {"user"}` or `401` |

- **Passwords:** argon2id (OWASP parameters: 19 MiB, 2 passes, 1 thread, 16-byte salt), stored as a PHC string.
- **Session:** 32 random bytes in the cookie `session` (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`); the database stores only its SHA-256. Expired sessions are rejected and deleted lazily.
- **CSRF:** the `Origin` host must equal the request host (`X-Forwarded-Host` behind Vercel and the Vite proxy) on every `POST`/`PUT`/`PATCH`/`DELETE`.
- **`?next=`** accepts only same-site paths (open-redirect protection).
- Every `/api/auth/*` answer is `no-store`; the catalog never reads the cookie and stays publicly cacheable.

```bash
curl -i -X POST -H "Origin: https://evil.example" 127.0.0.1:8080/api/auth/demo   # -> 403 {"error":"cross-origin request blocked"}
```
</details>

<details>
<summary><b>Checkout and orders API</b> (<code>/api/checkout/quote</code>, <code>/api/orders…</code>)</summary>

| Endpoint | Body | Answers |
|---|---|---|
| `POST /api/checkout/quote` (no sign-in) | `{"items":[{"offerId","quantity","expectedPriceCents"}]}` | `200 {"lines":[Line],"totalCents"}` · `400` |
| `POST /api/orders` | `{"idempotencyKey" (UUID),"items":[…]}` | `201` new · `200` same key again · `409 cart_changed` with lines · `409` too many unpaid orders · `400` · `401` |
| `GET /api/orders` | – | `200 {"orders":[…]}`, newest first (max 100) |
| `GET /api/orders/{id}` | – | `200 {"order","serverTime"}` · `404` (unknown **or not yours**) |
| `POST /api/orders/{id}/pay` | `{"outcome":"success"\|"decline"}` | `200` (also when already paid) · `402` declined · `409` expired / not payable · `404` |
| `POST /api/orders/{id}/cancel` | – | `200` · `409` not pending · `404` |

Limits: 1–20 lines per order, quantity 1–5 per line, an offer only once, quantity ≤ stock. Every endpoint is `Cache-Control: no-store`. Types: [`src/api/types.ts`](src/api/types.ts), calls: [`src/api/orders.ts`](src/api/orders.ts).
</details>

<details>
<summary><b>Environment variables</b></summary>

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API (local `.env`, Vercel project settings) | Neon **pooled** string. Local + Vercel Preview: `dev` branch. Vercel Production: `production` branch. |
| `DATABASE_URL_DIRECT` | `cmd/migrate`, `cmd/seed` (local `.env` = `dev`; GitHub secret `PROD_DATABASE_URL_DIRECT` = `production`) | Neon **direct** string (no `-pooler`). **Never set on Vercel.** |
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | `cmd/igdb-snapshot` only, local `.env` only | Twitch app credentials. **Never on Vercel or GitHub.** |
| `TEST_DATABASE_URL` | Go integration tests | A throw-away Postgres; empty = the tests skip |

`.env` is git-ignored; only `.env.example` is committed.
</details>

<details>
<summary><b>Database migrations</b> (<code>cmd/migrate</code>)</summary>

SQL files in [`migrations/`](migrations/) (numbered, [goose](https://github.com/pressly/goose) format), embedded into the `cmd/migrate` binary.

```bash
go run ./cmd/migrate status            # applied / pending
go run ./cmd/migrate up                # apply all pending
go run ./cmd/migrate down              # roll back ONE step
go run ./cmd/migrate create add_games  # new numbered file (no DB needed)
```

**Production** is migrated only by GitHub Actions ([`migrate-production.yml`](.github/workflows/migrate-production.yml)): manually, or automatically after a merge that touches `migrations/`. **For every PR with a migration** the owner runs *Actions → Migrate production → Run workflow* with "Use workflow from" = **the PR branch** *before* merging, so the schema is ready before the new code deploys. Migrations are always backward compatible (expand/contract), so the old code keeps working in between. After that run the migration file never changes; a fix is a new migration.
</details>

<details>
<summary><b>Seed data</b> (<code>cmd/seed</code>, <code>cmd/igdb-snapshot</code>)</summary>

The catalog (50 real games, 9 platforms, 4 regions, 8 fictional sellers, offers and fake keys) comes from a committed **IGDB snapshot** – *Data provided by [IGDB](https://www.igdb.com/)*. Covers load from IGDB's image CDN; nothing is downloaded into the repo.

```bash
# owner only (IGDB credentials in the local .env):
go run ./cmd/igdb-snapshot                 # writes seed/igdb_snapshot.json (games + aliases)
go run ./cmd/igdb-snapshot --aliases-only  # keeps the 50 games, refreshes only their search aliases

go run ./cmd/seed                # seeds an EMPTY catalog, refuses if data exists
go run ./cmd/seed --reset        # deletes the catalog and seeds again (refuses while orders exist)
go run ./cmd/seed --aliases-only # adds only the MISSING search aliases (safe to repeat); orders, offers, keys untouched
```

- **Deterministic:** a fixed RNG seed – the same snapshot always gives the same rows and ids. The tool prints a `catalog checksum`, identical on `dev` and a freshly seeded `production`: **`4e94565d904cc1698b65cce04cbff8d9`**.
- **Search aliases:** IGDB `alternative_names` (Latin script, max 10 per game) plus a few hand-written ones in [`seed/search_aliases_extra.json`](seed/search_aliases_extra.json).
- Everything is written in **one transaction**. Key codes are obviously fake: `DEMO-XXXX-XXXX-XXXX`.
- **Production** is seeded only by GitHub Actions ([`seed-production.yml`](.github/workflows/seed-production.yml)): two dropdowns, nothing to type – `mode` (`aliases-only` / `seed-empty` / `reset`) and the safety switch `confirm` (`not confirmed` → `seed-production`).
</details>

<details>
<summary><b>Repository layout</b></summary>

- `api/index.go` – the only Vercel function; forwards to the router
- `pkg/server/` – router and handlers (they depend on small interfaces: `DBPinger`, `CatalogReader`, …); query validation, CSRF, sessions
- `pkg/db/` – lazy, shared pgx pool (+ one retry on a cold-start connection error)
- `pkg/catalog/` – listing + facets, product page, search + suggestions
- `pkg/homepage/` – home page blocks: registry, hero, tiles, platforms, product rows
- `pkg/orders/` – checkout rules (`rules.go`) and transactions (`store.go`)
- `pkg/auth/` – passwords, session tokens, users, rate limit
- `pkg/seedgen/`, `pkg/igdb/`, `pkg/dbsafe/` – seed generation, IGDB snapshot, secret-free DB errors for the tools
- `pkg/testdb/` – test helper: migrated + seeded Postgres from `TEST_DATABASE_URL`
- `cmd/local/`, `cmd/migrate/`, `cmd/seed/`, `cmd/igdb-snapshot/` – local server and tools
- `migrations/`, `seed/` – SQL migrations and the IGDB snapshot, embedded with `go:embed`
- `src/api/` – `apiFetch` client (timeout, typed errors) and typed endpoint functions
- `src/app/` – routes (lazy pages), layout, header, demo banner, footer, query client, error pages, prefetch on intent
- `src/components/` – base UI components (Button, Price, Skeleton, EmptyState, `PrefetchLink`, …)
- `src/features/` – home, store, search, product, cart, checkout, orders, auth
- `src/pages/` – one file per route; `src/lib/` – helpers and hooks; `src/styles/` – tokens and global CSS
- `public/` – `robots.txt`, favicon, the Innert hero pictures
- `docs/` – [`DATA_MODEL.md`](docs/DATA_MODEL.md), [`DESIGN.md`](docs/DESIGN.md), [`PAAISKINIMAI_LT.md`](docs/PAAISKINIMAI_LT.md) (explanations in Lithuanian), [`tasks/`](docs/tasks/), [`reports/`](docs/reports/), [`screenshots/`](docs/screenshots/)
- `ai-logs/` – Claude Code session logs
</details>

## About the author
**[Kodmo Lab](https://kodmolab.lt)** is a small software studio building practical, offline-first tools for small businesses.
Its main product, **[Kodmo Auto](https://kodmolab.lt/auto/)**, is an offline Windows app for auto repair shops in Lithuania
(customers, jobs, parts inventory, staff; low-stock alerts), built with Python, PySide6, FastAPI and SQLite and developed end to end
with AI coding tools (Claude Code) using the same small-task / spec / testing workflow as this project.

## Credits
- Game data and covers: *Data provided by [IGDB](https://www.igdb.com/)* (Twitch Developer Service Agreement, non-commercial use).
- Font: [Metropolis](https://github.com/dw5/Metropolis) by Chris Simpson – Unlicense (public domain), self-hosted.
- Icons: [Lucide](https://lucide.dev) – ISC license.
- Hero art of **Innert** – used with the permission of its author.
