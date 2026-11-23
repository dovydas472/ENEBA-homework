> **Disclaimer & Attribution:** This repository is a non-commercial portfolio and internship assignment project demonstrating marketplace UI and architecture. It is not affiliated with, endorsed by, or connected to Eneba (JSC "Helis play"). Authentication and checkout are strictly simulated – no real payments, user credentials, or digital keys are processed or issued. Game metadata and cover images are provided by IGDB under the Twitch Developer Service Agreement for non-commercial use. All product names, logos, brands and artwork remain the property of their respective owners.

# EneHomeworkBa (ENEBA homework)

## Stack
- Frontend: React + TypeScript (Vite), repo root
- Backend: Go (`net/http` ServeMux) as a single Vercel serverless function
- Database: Neon Postgres via `pgx` v5 / `pgxpool`, **pooled** connection (`-pooler` host)
- Hosting: Vercel, region `fra1` (Frankfurt)

## Run locally
Requirements: Go 1.25+ (see `go.mod`), Node 20+.

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL (Neon `dev` branch, pooled string)

# terminal 1 – Go API on 127.0.0.1:8080 (run from the repo root so .env is found)
go run ./cmd/local             # another port: go run ./cmd/local -port 8092

# terminal 2 – Vite dev server on 127.0.0.1:5173 (proxies /api -> 127.0.0.1:8080)
npm run dev
```

Both listen on **127.0.0.1 only** (this computer; no firewall prompt).
Open http://127.0.0.1:5173 – the page should show `API: ok · DB: ok (NN ms)`.
Quick API check: `curl 127.0.0.1:8080/api/health` →
`{"status":"ok","db":"ok","dbLatencyMs":37}` (or `503` + `{"status":"error","db":"error"}`
if the database is unreachable / `DATABASE_URL` is missing).

Tests: `go test ./...`

## Environment variables
| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API (local `.env`, Vercel project settings) | Neon **pooled** string. Local + Vercel Preview: `dev` branch. Vercel Production: `production` branch. |
| `DATABASE_URL_DIRECT` | `cmd/migrate` and `cmd/seed` (local `.env` = `dev` branch, GitHub secret `PROD_DATABASE_URL_DIRECT` = `production`) | Neon **direct** string (no `-pooler`). **Never set on Vercel.** |
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | `cmd/igdb-snapshot` only, local `.env` only | Twitch app credentials. **Never on Vercel or GitHub.** |

`.env` is git-ignored; only `.env.example` is committed.

## API
JSON, `camelCase` field names. Money is **integer cents** (formatting is the frontend's job). Errors are always
`{"error":"..."}`; an unreachable database gives `503` and any other unexpected error `500`, both with a generic message (never SQL or driver text).

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | API + DB status (see above) |
| `GET /api/products` | Store listing: `items`, `total`, `page`, `pageSize` and `facets` (filter options with counts) |
| `GET /api/products/{slug}` | Product page: `product`, `game`, `offers` (buyable, cheapest first), `variants` (other versions of the game). Unknown slug → `404` |

**`GET /api/products` query parameters** (all optional; an empty value = not given; unknown names are ignored):

| Parameter | Meaning |
|---|---|
| `q` | Search text (Task 13a): game **title or alias** ("gta 5", "rdr2"), contains or typo match (`witchr 3`). Trimmed, 2–100 characters. A **2-character** query matches only at the **start of a word** of the title or an alias (`re` → Red Dead Redemption, not Dishonored; `gt` → GTA via the alias "GTA 5"); 3+ characters match anywhere and tolerate typos. Filters the items **and** the facets |
| `platform`, `region` | Comma-separated slugs, several allowed: `platform=steam,psn`. Unknown slugs match nothing |
| `minPrice`, `maxPrice` | Integer cents ≥ 0, `minPrice ≤ maxPrice`. Uses the cheapest *in-stock* price, so out-of-stock products are excluded when a price filter is set |
| `sort` | `popularity` (default without `q`) · `relevance` ("Best match", default with `q`; without `q` = popularity) · `price_asc` · `price_desc` · `discount` · `newest` · `title`. Out-of-stock products come last on the price and discount sorts |
| `page`, `pageSize` | `page` ≥ 1 (default 1); `pageSize` 1–48 (default 24) |

An invalid value (`sort=cheapest`, `pageSize=100`, `minPrice=-1` …) is answered with `400` and a clear message, never
silently ignored. A `price` of `null` means *out of stock*.

`cheapestOffer` (`offerId`, `stock`, `sellerName`, or `null` when out of stock) is the offer a card's "Add to cart" button
adds: always the same offer as the first one on the product page (cheapest, ties broken by offer id).

**Facets** come in the same response and follow the current filters: each group (`platforms`, `regions`) is counted
with all *other* active filters applied but not its own, so the other options of a group keep their counts. Entries with
count 0 are left out unless they are currently selected. `priceRange` (`minCents`/`maxCents`, or `null`) covers the
in-stock products that match the platform/region filters (the price filter itself is ignored).

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
    "platforms": [{"slug": "steam", "name": "Steam", "count": 43}, {"slug": "xbox-live", "name": "Xbox Live", "count": 1},
                  {"slug": "psn", "name": "PSN", "count": 8}, "…"],
    "regions":   [{"slug": "global", "name": "GLOBAL", "count": 43}, {"slug": "europe", "name": "EUROPE", "count": 6}, "…"],
    "priceRange": {"minCents": 549, "maxCents": 5099}
  }
}
```
*(shortened; real output from the seeded `dev` database.)* Note how the `platforms` counts describe the *region* filter
(`global`) but not the platform filter: Steam is selected, yet PSN still shows its 8 products. The `regions` counts
describe the platform filter (all Steam products: 43 + 6 + 1 + 4 = 54).

`GET /api/search/suggest?q=…` – up to 6 games for the search-box dropdown, best match first, **one item per game**:
`{"items": [{"gameTitle", "productSlug", "edition", "platform": {slug, name}, "region": {slug, name}, "coverUrl", "priceCents" | null,
"inStock", "matchedAlias" | null}]}`. `productSlug` is the game's cheapest in-stock product (none in stock: its first
product, `priceCents: null`, `inStock: false`); `edition` is that product's edition (`"Standard"` or e.g. `"Game of the Year Edition"`);
`matchedAlias` is the alias that matched when the title did not. The same 2-character word-start rule as for `q` above applies.

```bash
curl "127.0.0.1:8080/api/search/suggest?q=gta%205"
```
```json
{"items": [{"gameTitle": "Grand Theft Auto V", "productSlug": "grand-theft-auto-v-steam-global", "edition": "Standard",
            "platform": {"slug": "steam", "name": "Steam"}, "region": {"slug": "global", "name": "GLOBAL"},
            "coverUrl": "https://images.igdb.com/…", "priceCents": 1199, "inStock": true, "matchedAlias": "GTA 5"}, "…"]}
```
How matching and ranking work (trigrams, aliases, the 0.55 threshold): [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), sketch 4.

**Caching.** Successful responses carry `Cache-Control` so the Vercel CDN can answer without calling the function:
listing `public, s-maxage=60, stale-while-revalidate=300`, product page `public, s-maxage=15, stale-while-revalidate=60`,
suggestions `public, s-maxage=300, stale-while-revalidate=600`; errors are `no-store`. Short staleness is safe because browsing never decides money: checkout re-checks stock and price
in the database before it charges anything.

Typed frontend functions: `src/api/catalog.ts` (`getProducts`, `getProduct`, `getSuggestions`), types in `src/api/types.ts`.

## Home page (Task 15)
The assignment: *the landing page is assembled from several different blocks; each block gets its content from its own
backend service or database, so the frontend only displays what it receives and nothing is hardcoded there.*

- **Block registry:** the table `homepage_blocks` lists the blocks (`key`, `type`, `title`, `position`, `enabled`, `config`).
  `GET /api/homepage` returns the enabled ones in order: `{"blocks":[{"key","type","title","endpoint"}]}`. The frontend
  (`src/features/home/`) has **one renderer per type** (`hero`, `tiles`, `platforms`, `product_row`) and fetches every block from its
  own `endpoint` with its own TanStack Query; it contains no block content, order or titles. An unknown type is skipped.
- **Each block is its own service** (`pkg/homepage`; handlers in `pkg/server/homepage_handlers.go`):

| Endpoint | Data source | Answers |
|---|---|---|
| `GET /api/homepage` | `homepage_blocks` | the registry (above) |
| `GET /api/blocks/hero` | `homepage_slides` + the catalog (live cheapest price of a product slide) | `{"slides":[{id,title,subtitle,badge,image:{url,srcset,mobileUrl,mobileSrcset},cta:{label,href}\|null,priceCents\|null}]}` |
| `GET /api/blocks/tiles` | `homepage_tiles` + the catalog (up to 3 cover images per tile) | `{"tiles":[{id,title,subtitle,href,accent,coverUrls}]}` |
| `GET /api/blocks/platforms` | the catalog (the Store's platform facet) + the block's icon config | `{"items":[{key,label,count,href,icon}]}` ("All games" first) |
| `GET /api/blocks/products/{key}` | the Store listing query, configured by the block row (`sort`, `limit`, `viewAllHref`) | `{"items":[Item],"viewAllHref"}` |

  Today they share one Go function and one database, but they only meet in the registry: each could move to its own
  service (a CMS for the hero and tiles, the catalog service for the rest) and only the endpoint URLs in Go would change.
- **Content lives in the database, inserted by migration `00006`** (not by the seed, so the catalog checksum is unchanged and
  production needs no reseed). Switching a block off: `UPDATE homepage_blocks SET enabled = false WHERE key = 'discounts';`
  – the block disappears without a deploy (locally at once; in production after the 5-minute CDN cache).
- **Caching:** every home page response `public, s-maxage=300, stale-while-revalidate=600`; errors `no-store` (503 database
  unreachable, 500 anything else, 404 unknown or disabled block).
- **Resilience:** one failing block shows "could not be loaded" + Retry in its own place; a block that crashes while drawing
  hides itself (an error boundary per block); the rest of the page keeps working.
- **Hero carousel:** arrows, dots, a Play/Pause button, Left/Right keys; autoplay every 6 s that pauses on hover and focus and is
  off with `prefers-reduced-motion`. The first slide's picture is the LCP element: loaded eagerly with `fetchpriority="high"`
  and a responsive `srcset`; the carousel has its size before anything loads (no layout shift).
- **Slides:** 1. **Innert** – a friend's game in development; its art is used with the author's permission (WebP files in
  `public/banners/`, no button because its repository is private). 2.–3. Grand Theft Auto V and The Witcher 3 with IGDB artworks
  and the live price + "Buy now".

## Accounts and sign-in (Task 14)
Email + password accounts, a one-click **demo user**, and pages that need a signed-in user (`/orders` now, `/checkout` later).

| Endpoint | Body | Answers |
|---|---|---|
| `POST /api/auth/register` | `{"email","password"}` | `201 {"user"}` + session cookie · `400` invalid input (password 8–128 characters) · `409` "An account with this email already exists" |
| `POST /api/auth/login` | `{"email","password"}` | `200 {"user"}` + cookie · `401` "Invalid email or password" (the same text for every reason) · `429` + `Retry-After` after 10 failures for that email in 15 minutes |
| `POST /api/auth/logout` | – | `204`, cookie cleared (also when already signed out) |
| `POST /api/auth/demo` | – | `201 {"user"}` + cookie: a **new** temporary demo account on every call |
| `GET /api/auth/me` | – | `200 {"user"}` or `401` |

`user` = `{"id", "email", "isDemo"}` – never a password hash. Every `/api/auth/*` answer is `Cache-Control: no-store`;
the catalog endpoints never read the cookie and stay publicly cacheable.

How it works, in short:
- **Passwords:** argon2id (OWASP parameters: 19 MiB, 2 passes, 1 thread, 16-byte salt), stored as a PHC string. A sign-in
  with an unknown email still runs one hash, so the response time does not reveal which emails exist.
- **Session:** 32 random bytes in the cookie `session` (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`);
  the database stores only its **SHA-256**. Expired sessions are rejected and deleted lazily. Browsers treat
  `http://127.0.0.1` as secure, so the `Secure` cookie also works in local development.
- **CSRF:** `SameSite=Lax` plus an `Origin` check on every `POST`/`PUT`/`PATCH`/`DELETE` of the whole API: the `Origin`
  host must equal the request host (`X-Forwarded-Host` behind Vercel's proxy, and behind the Vite dev proxy). Missing or foreign → `403`.
- **Rate limit:** counted in the database (`login_failures`), so it holds across serverless instances; each attempt is
  counted before the password check, atomically, and a successful sign-in clears the count.
- **Demo user:** "Sign in as demo user" creates `demo-<random>@demo.invalid` with no password (it cannot be signed in to
  with a password), so every reviewer sees only their own orders. The UI shows it as "Demo user".
- **`?next=`:** `/login?next=/orders` returns there after signing in. Only same-site paths are accepted (`/…`, not `//…`,
  no scheme, no `\`); anything else goes to `/` (open-redirect protection).

```bash
# A POST from another site is refused (CSRF check):
curl -i -X POST -H "Origin: https://evil.example" 127.0.0.1:8080/api/auth/demo   # -> 403 {"error":"cross-origin request blocked"}
# The same request "from our own page" works:
curl -i -X POST -H "Origin: http://127.0.0.1:8080" 127.0.0.1:8080/api/auth/demo  # -> 201 {"user":{...,"isDemo":true}} + Set-Cookie
```

**Rate limit trade-off (decided: keep per email).** The limit counts failures per *email*, so anyone who knows an email
can send 10 wrong passwords and pause password sign-in for that email for 15 minutes. Nothing leaks and no account is taken
over: sessions that are already signed in keep working, and the demo button always works. It is kept because it is simple,
it cannot be bypassed by switching IP addresses, and this is a demo shop. **Production option:** key the counter on
**email + client IP** (Vercel sends the client address in `X-Forwarded-For` / `X-Real-IP`). Then an attacker only locks
out their own IP, while the owner can still sign in from theirs. The cost is that an attacker with many IPs gets 10 guesses
per IP, so a production shop would add a per-account slow-down or a CAPTCHA after the limit.

**Shortcuts (simulated parts of a real sign-up):**
- no email verification: any well-formed address can register and is signed in at once;
- no password reset ("forgot password") and no "sign out everywhere";
- **demo accounts are never cleaned up (decided):** every "Sign in as demo user" click adds a row to `users`. That is
  fine at demo scale. A real shop would delete old demo accounts (and decide what happens to their orders) with a
  scheduled job.

A real shop would add signed, single-use email links for verification and reset.

Frontend: `src/api/auth.ts` (typed calls), `src/features/auth/` (`useCurrentUser`, the sign-in / sign-up page, `RequireAuth`),
the header account menu in `src/app/AccountMenu.tsx`.

## Checkout (Task 16a)
The cart lives in the browser. At checkout the server **re-prices it**, creates a **pending order** and **reserves the keys
for 15 minutes**; the buyer then "pays" (simulated) and the order becomes **paid** and shows its keys.
All code is in `pkg/orders` (`rules.go` = every business rule, pure and unit-tested; `store.go` = the SQL transactions);
the handlers are `pkg/server/orders_handlers.go`. Every endpoint is `Cache-Control: no-store`.

| Endpoint | Body | Answers |
|---|---|---|
| `POST /api/checkout/quote` (no sign-in) | `{"items":[{"offerId","quantity","expectedPriceCents"}]}` | `200 {"lines":[Line],"totalCents"}` · `400` |
| `POST /api/orders` | `{"idempotencyKey" (UUID),"items":[…]}` | `201 {"order"}` new · `200 {"order"}` same key again · `409 {"error":"cart_changed","lines":[Line]}` · `409 {"error":"Too many unpaid orders – pay or cancel one first"}` · `400` · `401` |
| `GET /api/orders` | – | `200 {"orders":[{id,status,totalCents,itemCount,createdAt,reservedUntil}]}`, newest first (max 100) |
| `GET /api/orders/{id}` | – | `200 {"order","serverTime"}` · `404` (unknown **or not yours**) |
| `POST /api/orders/{id}/pay` | `{"outcome":"success"\|"decline"}` | `200 {"order"}` (also when already paid) · `402` "Payment declined (simulated)" · `409` "Reservation expired" / "Order is not payable" · `404` |
| `POST /api/orders/{id}/cancel` | – | `200 {"order"}` · `409` "Order is not pending" · `404` |

`Line` = `{offerId, quantity, unitPriceCents, stock, maxQuantity, available, productSlug, title, edition, platformName, regionName, sellerName, coverUrl, changes[]}`;
`quantity` is what can really be bought now, `changes` ⊆ `price_changed` · `quantity_reduced` · `unavailable` (offer paused, out of stock, or no such offer).
`Order` = `{id, status, totalCents, createdAt, reservedUntil, paidAt, items:[{offerId, productSlug, title, edition, platformName, regionName, sellerName, unitPriceCents, quantity, keys[]}]}`;
`itemCount` is the number of keys (sum of the quantities). Types: `src/api/types.ts`, calls: `src/api/orders.ts`.

The rules (numbered R1–R9 in `pkg/orders/rules.go`):
- **Limits:** 1–20 lines per order, quantity 1–5 per line, an offer only once, quantity ≤ stock.
- **The server is the truth:** the client's `expectedPriceCents` is only *compared*. If a price, the stock or an offer's state
  differs, **no order is created** and the `409` lists every line with its `changes`. The order total and item snapshots
  (title, edition, platform, region, seller, unit price) come from the database.
- **Reservation without a race:** the keys are taken with `SELECT … FOR UPDATE SKIP LOCKED` inside one transaction, so two
  buyers can never get the same key and never wait for each other (see `docs/PAAISKINIMAI_LT.md`). One order = one
  transaction: either the order, its items and *all* its keys exist, or nothing.
- **Idempotency:** `POST /api/orders` carries an `idempotencyKey` (one per checkout attempt). The same user sending the same
  key again gets the **same order** (`200`), nothing is reserved twice - decided by `UNIQUE (user_id, idempotency_key)`, so it
  also holds for two identical requests arriving at the same moment. Paying a paid order returns it unchanged; a partial unique index allows at most one
  succeeded payment per order.
- **At most 3 unpaid orders per user (R10):** a user who already holds 3 *pending, not yet expired* orders gets `409 "Too many unpaid orders – pay or cancel one first"` on the next `POST /api/orders`. Paying, cancelling or letting one expire frees a place. It stops a script from reserving every key of an offer, 15 minutes at a time. The check runs **inside the create transaction** after locking the user's row (`SELECT … FOR NO KEY UPDATE`), so eight parallel creates of one user produce exactly three orders. A *retry* of an order that already exists (same idempotency key) is still answered with that order, also at the cap. There is no per-IP rate limit (see the shortcuts).
- **Lazy expiry:** nothing runs in the background. A pending order whose `reservedUntil` has passed is *shown* as `expired`, and a
  key whose reservation has ended counts as available (the next buyer simply takes it over). Paying too late marks the order
  `expired`, frees its keys and answers `409`. A declined payment (`402`) leaves the order pending: try again while it is valid.
- **Keys are secret:** key codes appear only in a **paid** order and only for its owner. Another user's order is `404`, exactly
  like an unknown id.
- **Time is injectable** (`Store.WithClock`), so tests simulate the 15 minutes without sleeping.

```bash
# (after signing in as the demo user in a browser - the session cookie is HttpOnly - or with a cookie jar)
curl -s -X POST 127.0.0.1:8080/api/checkout/quote -H "Origin: http://127.0.0.1:8080" -H "Content-Type: application/json" \
  -d '{"items":[{"offerId":412,"quantity":2,"expectedPriceCents":549}]}'
```

**Shortcuts (decided):**
- **the payment is simulated:** the buyer picks `success` or `decline`; there is no card form, no card data and no payment provider;
- **no clean-up job:** demo users and their orders (paid, expired, cancelled) stay in the database forever, just like demo users in Task 14;
- **no rate limit** on the checkout endpoints (only the cap of 3 unpaid orders per user): a script can still create and cancel orders quickly, and a demo account is free to make. A real shop would add a per-user and per-IP rate limit and tighter quotas for anonymous accounts;
- re-seeding the catalog (`cmd/seed --reset`) **refuses** while orders exist (they reference offers and keys), so order history is never deleted by accident;
- expiry is lazy: an expired pending order stays `pending` in the table until someone pays, cancels or reads it (reading shows `expired` but does not write);
- **a second Checkout of the same cart creates a second pending order** (Task 16b, known simplification): the browser forgets the idempotency key once an
  order exists, so going Back from the payment page and pressing Checkout again reserves keys again, while the first order keeps its keys until it is paid,
  cancelled or expires (15 minutes). The cap of 3 unpaid orders per user limits this. A real shop would reopen the existing pending order when the cart is unchanged;
- the cart is a page only (`/cart`; no header popup as on Eneba), and "Cancel order" has no confirmation step (nothing is lost: the cart stays).

**Running the database tests locally.** They need a throw-away Postgres in `TEST_DATABASE_URL` (never a Neon branch) and must run
one package at a time because `pkg/catalog` re-seeds the tables `pkg/orders` uses: `go test -p 1 ./...` (CI does this).

## Database migrations
Migrations are SQL files in `migrations/` (numbered, [goose](https://github.com/pressly/goose) format) embedded into the `cmd/migrate` binary.

```bash
# local: runs against the Neon `dev` branch (DATABASE_URL_DIRECT from .env), from the repo root
go run ./cmd/migrate status            # which migrations are applied / pending
go run ./cmd/migrate up                # apply all pending
go run ./cmd/migrate down              # roll back ONE step
go run ./cmd/migrate version           # current version
go run ./cmd/migrate create add_games  # new numbered file in migrations/ (no DB needed)
```

**Production** is migrated only by GitHub Actions (`.github/workflows/migrate-production.yml`):
manually via *Actions → Migrate production → Run workflow*, or automatically after a merge to `main` that touches
`migrations/` or `cmd/migrate/`. It needs the repository secret `PROD_DATABASE_URL_DIRECT`
(Neon `production` branch, **direct** connection string). Never run migrations against production from a laptop.

**Procedure for every PR that adds a migration** (schema first, code second):
1. Review the PR and wait for green CI.
2. *Actions → Migrate production → Run workflow*, **"Use workflow from" = the PR branch**. The workflow checks out that
   branch, so it applies the new migration to production. Check the log: the new file is listed as applied.
3. Merge. The Vercel deploy now finds the schema already in place; the automatic migrate run after the merge has
   nothing left to apply.

Why: the new code may read a table or column the migration adds. If the code deployed first, it would fail until the
migration ran. The migration itself is always backward compatible (expand/contract), so the *old* code keeps working
against the new schema between steps 2 and 3. After step 2 the migration file must not change; a fix is a new migration.

## Seed data
The catalog (50 real games, 9 platforms, 4 regions, 8 fictional sellers, offers and fake keys) comes from a
committed **IGDB snapshot** – *Data provided by [IGDB](https://www.igdb.com/)*. Covers are loaded straight from
IGDB's image CDN; nothing is downloaded into the repo.

```bash
# owner only (needs IGDB_CLIENT_ID / IGDB_CLIENT_SECRET in the local .env):
go run ./cmd/igdb-snapshot                 # full refresh: writes seed/igdb_snapshot.json (games + aliases)
go run ./cmd/igdb-snapshot --aliases-only  # keeps the 50 games, only refreshes their search aliases

# local: Neon `dev` branch (DATABASE_URL_DIRECT from .env), from the repo root
go run ./cmd/seed              # seeds an EMPTY catalog, refuses if data exists
go run ./cmd/seed --reset      # deletes the catalog and seeds it again
```

- **Deterministic:** a fixed RNG seed – the same snapshot always gives exactly the same rows (and ids). The tool prints a `catalog checksum`; it is identical on `dev` and `production`. Current value (since Task 13a, with the search aliases): **`4e94565d904cc1698b65cce04cbff8d9`**.
- **Search aliases** (`game_aliases`): IGDB `alternative_names` of the 50 games (Latin script, no `.exe` names, max 10 per game) plus a few hand-written ones in `seed/search_aliases_extra.json`, each with a reason.
- Everything is written in **one transaction** (all or nothing). Key codes are obviously fake: `DEMO-XXXX-XXXX-XXXX`.
- **Production** is seeded only by GitHub Actions: *Actions → Seed production → Run workflow* (`confirm` = `seed-production`, tick `reset` to replace existing data).

## How this project was built
Planning chat → task file → Claude Code works on a `task/NN-name` branch → PR with a report → review → merge.

- [`CLAUDE.md`](CLAUDE.md) – standing rules Claude Code follows in every session
- [`docs/tasks/`](docs/tasks/) – the task files, saved verbatim
- [`docs/reports/`](docs/reports/) – one report per task (what changed, how it was verified, open questions)
- [`ai-logs/`](ai-logs/) – exported Claude Code sessions

## About the author
**[Kodmo Lab](https://kodmolab.lt)** is a small software studio building practical, offline-first tools for small businesses.
Its main product, **[Kodmo Auto](https://kodmolab.lt/auto/)**, is an offline Windows app for auto repair shops in Lithuania
(customers, jobs, parts inventory, staff; low-stock alerts), built with Python, PySide6, FastAPI and SQLite and developed end to end
with AI coding tools (Claude Code) using the same small-task / spec / testing workflow as this project.

## Layout
- `api/index.go` – the only Vercel function; forwards to the router
- `pkg/server/` – router and handlers (they depend on small interfaces: `DBPinger`, `CatalogReader`, `HomepageReader`, ...); query-string validation
- `pkg/db/` – lazy, shared pgx connection pool
- `pkg/catalog/` – catalog queries (listing + facets, product page, search + suggestions), seller rating label; pure Go + pgx, no HTTP
- `pkg/testdb/` – test helper: migrated + seeded Postgres from `TEST_DATABASE_URL` (tests skip when it is empty; with `REQUIRE_TEST_DB=1`, as in the CI `migrations` job, they fail instead)
- `cmd/local/` – local dev server using the same router (loads `.env`)
- `cmd/migrate/` – goose migration runner (`up`/`down`/`status`/`version`/`create`)
- `cmd/igdb-snapshot/` – one-time, local IGDB download → `seed/igdb_snapshot.json`
- `cmd/seed/` – deterministic catalog seed from the snapshot (`--reset`)
- `seed/` – the committed IGDB snapshot and the hand-written extra search aliases, embedded with `go:embed`
- `pkg/igdb/` – snapshot format, Twitch OAuth + IGDB client, selection filters
- `pkg/seedgen/` – generation rules (platforms, products, prices, offers, keys), validation, bulk insert
- `pkg/dbsafe/` – `-pooler` guard and secret-free error messages shared by `cmd/migrate` and `cmd/seed`
- `public/robots.txt` – the demo asks search engines not to index it (plus `noindex` in `index.html`)
- `migrations/` – numbered SQL migrations, embedded with `go:embed`
- `docs/DATA_MODEL.md` – the data model (ER diagram, tables, state machines, query sketches)
- `src/api/` – `apiFetch` client (timeout, typed errors), catalog, auth and checkout / order functions + JSON types
- `src/app/` – app frame: routes, layout, header, demo banner, footer, TanStack Query client, "waking up" notice
- `src/components/` – base UI components (Button, Badge, Price, Skeleton, EmptyState, ErrorState, SearchField)
- `pkg/homepage/` – the home page blocks: registry, hero, tiles, platforms and product rows (store + service; strict config parsing)
- `src/pages/` – one file per route
- `src/features/home/` – the home page block renderers (hero carousel, side tiles, platform row, product row) and the type → renderer map
- `public/banners/` – the Innert hero pictures (WebP, several widths)
- `src/features/store/` – the parts of the Store page (product card and grid, filters, price slider, pagination, mobile drawer)
- `src/features/cart/`, `src/features/checkout/`, `src/features/orders/` – the cart store, the cart and payment pages (quote notices, idempotency key, countdown, simulated payment) and the order pages (masked keys)
- `src/lib/` – helpers and hooks (`formatPrice`, Store filters in the URL, ...)
- `docs/PAAISKINIMAI_LT.md` – explanations in Lithuanian
- `ai-logs/` – exported Claude Code sessions
