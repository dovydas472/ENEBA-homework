# Task 05 – Data model design + catalog migration

**Model:** Opus · **Effort:** high

## Goal
1. Design the **whole** data model once and document it in `docs/DATA_MODEL.md` (catalog + planned auth + planned commerce).
2. Implement **only the catalog tables** now, as migration `00002`. Auth and commerce tables are created later in their own tasks, following this document.
No seed data, no Go data-access code, no API in this task.

## Decisions already made (do not change)
- **P1** `platforms` and `regions` are lookup tables (slug + name), not Postgres enums.
- **P2** Stock and cheapest price are **derived by queries**, never stored (stock = count of available keys; cheapest = MIN active offer price).
- **P3** Key reservation has an expiry (`reserved_until`). An expired reservation counts as available – no cron job.
- **P4** Separate `payments` table (planned) – simulated payment attempts, allows "declined → retry".
- **P5** `sessions` (planned) stores a **hash** of the session token, never the token itself.
- **P6** Genres are display only: `text[]` on `games`, no genre filter.
- **P7** Full design now, catalog migration now; `users`/`sessions` in the auth task, `orders`/`order_items`/`payments` + `keys.order_item_id` in the checkout task.
- **P8** Data access later will be hand-written `pgx` queries (no ORM, no sqlc).
- Earlier: money = integer cents (EUR only); orders use UUIDs; products have slugs; `order_items` keep a price + product title snapshot; keys taken with `FOR UPDATE SKIP LOCKED`; checkout idempotency key; `citext` for e-mail.
- **Images:** `games.cover_url` is **nullable**. The image source is not decided yet; the frontend will show a generated placeholder when it is NULL or fails to load. The model must work for both cases.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/05-data-model`, task file first, commit any uncommitted `ai-logs/`).

## 2. `docs/DATA_MODEL.md`
- Mermaid ER diagram of the full model. Mark planned (not yet created) tables clearly.
- Per table: purpose, columns (type, null/default), keys, constraints, indexes – and **why** (one line each).
- State machines: key (`available → reserved → sold`, `reserved → available` on expiry/failure) and order (`pending → paid | failed | expired`).
- Query sketches (SQL, not Go), because they justify the schema:
  - store listing: products with game title, platform, region, cheapest active offer price, offer count, in-stock flag – with filters (platform, region, price range) and sorting (price, title, release date);
  - product page: all active offers of one product with seller info and stock per offer, cheapest first;
  - reserving N keys for one offer with `FOR UPDATE SKIP LOCKED` (treating expired reservations as available).
- Short "What a production system would do differently" section (e.g. encrypting key codes at rest, multi-currency, caching cheapest price at scale).
- Keep it readable – this document will be used to explain the design in the interview.

## 3. Migration `00002` – catalog tables
Create the file with `go run ./cmd/migrate create catalog`. Tables:

- **platforms**, **regions**: `id` (identity PK), `slug` (unique, lowercase/`-` only, CHECK), `name`, `sort_order`.
- **games**: `id`, `slug` (unique), `title`, `description` (not null, default ''), `genres text[]` (not null, default '{}'), `release_date` (date, null), `developer`, `publisher` (null), `cover_url` (null), `created_at`.
  Index for typo-tolerant / partial title search with `pg_trgm` (choose the operator class and expression that fit both `similarity` and `ILIKE '%…%'`; explain the choice).
- **products**: `id`, `game_id`, `platform_id`, `region_id` (FKs, `ON DELETE RESTRICT`), `edition` (not null, default 'Standard'), `slug` (unique), `created_at`. Unique `(game_id, platform_id, region_id, edition)`. Indexes for the filters.
- **sellers**: `id`, `slug` (unique), `name`, `positive_feedback_pct` (`numeric(4,1)`, CHECK 0–100), `reviews_count` (CHECK ≥ 0), `created_at`.
- **offers**: `id`, `product_id`, `seller_id` (FKs, RESTRICT), `price_cents` (integer, CHECK > 0), `is_active` (default true), `created_at`, `updated_at`. Unique `(product_id, seller_id)`. Index that serves "active offers of a product ordered by price".
- **keys**: `id`, `offer_id` (FK, RESTRICT), `code` (not null), `status` (text, CHECK in `available`/`reserved`/`sold`, default `available`), `reserved_until` (timestamptz, null), `sold_at` (null), `created_at`. Unique `(offer_id, code)`. CHECK that `reserved_until` is set only when status is `reserved`, and `sold_at` only when `sold`. Partial index that makes "available keys of an offer" fast (think about expired reservations).
- All timestamps `timestamptz`, default `now()`.
- Down: drop everything in reverse dependency order.
- New tables only → backward compatible (expand/contract rule satisfied).

If you believe any listed column/constraint is wrong or missing, **do not silently change it** – implement as listed and explain your suggestion in the report under "Open questions".

## 4. Verify (Neon `dev` only)
- Standard checks from `CLAUDE.md`.
- `go run ./cmd/migrate up` → `status` → `down` → `up`.
- Constraint test: an SQL script (kept in the report, not in the repo) that runs inside a transaction which is **rolled back**, and shows each of these is rejected: duplicate slug; offer with `price_cents = 0`; second offer for the same product+seller; key with status `foo`; `reserved` key without `reserved_until`; deleting a game that has products. Also show one valid insert chain (platform → region → game → product → seller → offer → key) succeeds.
- `EXPLAIN` of the store-listing sketch on the empty schema is not needed.

## 5. Docs
- `CLAUDE.md`: add "Data model: see `docs/DATA_MODEL.md`. Any schema change must update it in the same PR."
- `docs/PAAISKINIMAI_LT.md`: one section per table + sections for P1–P3, P5, trigram index, `SKIP LOCKED`, why RESTRICT and not CASCADE, why CHECK constraints in the DB and not only in Go. Each with *ką daro, kodėl taip, ko gali paklausti pokalbyje*.

## Out of scope
Seed data, Go repository code, API endpoints, auth/commerce tables.

## Report
As defined in `CLAUDE.md`. At the end of the session: export the session log (remote procedure) and commit it on this branch.
