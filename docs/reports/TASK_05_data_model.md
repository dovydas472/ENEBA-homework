# Report – Task 05: data model design + catalog migration

Task file: [`../tasks/TASK_05_data_model.md`](../tasks/TASK_05_data_model.md)
Branch: `task/05-data-model` (from `main` at `e1de211`, after the merge of PR #2)

## 1. Files changed
- New: `docs/tasks/TASK_05_data_model.md` (verbatim, first commit).
- New: `migrations/00002_catalog.sql` – created with `go run ./cmd/migrate create catalog`; tables `platforms`, `regions`, `games`, `products`, `sellers`, `offers`, `keys`, their constraints and indexes; Down drops them in reverse dependency order.
- New: `docs/DATA_MODEL.md` – full model: Mermaid ER diagram (planned tables marked), per-table columns/constraints/indexes with reasons, planned auth + commerce tables, key and order state machines, 4 query sketches, RESTRICT / CHECK rationale, "What a production system would do differently".
- Changed: `CLAUDE.md` (Database rules: "Data model: see `docs/DATA_MODEL.md`. Any schema change must update it in the same PR."), `README.md` (layout line for `DATA_MODEL.md`), `docs/PAAISKINIMAI_LT.md` (17 new sections: overview, one per table – `platforms`/`regions` share one –, P1, P2, P3, P5, trigram index, `SKIP LOCKED`, RESTRICT vs CASCADE, CHECK in the DB).
- New: `ai-logs/2026-11-20_02_data-model.md` (this session, converted from the transcript, redacted).
- No changes in `api/`, `pkg/`, `src/`, `cmd/`, `go.mod`, `go.sum` (`git diff --stat main -- api pkg src cmd go.mod go.sum` is empty).

## 2. Verification results
Everything ran against the Neon **`dev`** branch only (nothing against `production`).

| Check | Result |
|---|---|
| `go build ./...`, `go vet ./...` | pass |
| `go test ./...` | pass (`cmd/migrate`, `pkg/server`) |
| `npm run build` | pass |
| `go.mod` `go` directive | still `go 1.25.0` |
| secret scan of the branch diff (`postgres://`, `neon.tech`, `password=`, `npg_`) | no matches |

`gofmt -l` lists some untouched Go files only because `core.autocrlf=true` checks them out with CRLF; the committed versions are gofmt-clean (checked with `git show HEAD:<file> | gofmt -l`). This task changes no Go files.

**Migration cycle** (`status` → `up` → `status` → `down` → `status` → `up` → `version`):
```
status   00001_extensions.sql  applied 2026-11-20 08:32:01 UTC
         00002_catalog.sql     pending
up       applied  00002_catalog.sql (683ms)
status   00002_catalog.sql     applied 2026-11-20 19:19:31 UTC
down     rolled back  00002_catalog.sql (489ms)
status   00002_catalog.sql     pending
up       applied  00002_catalog.sql (647ms)
version  current version: 2
```
`dev` is left at version 2 (catalog tables exist, empty).

**Constraint test.** Run with a throwaway pgx runner from the scratchpad (no `psql` on this machine; nothing added to the repo). The whole script is one transaction that is **rolled back**; every negative case must fail with the expected SQLSTATE, otherwise the helper re-raises and the script stops.

```sql
BEGIN;

-- Helper (temporary, disappears with the rollback): runs stmt, expects it to fail with the given SQLSTATE.
-- If stmt succeeds, the FAIL exception is re-raised and the whole script stops.
CREATE FUNCTION pg_temp.expect_error(label text, stmt text, expected text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAIL: "%" was accepted', label;
EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected THEN
        RETURN format('OK  %s -> rejected [%s] %s', label, SQLSTATE, SQLERRM);
    END IF;
    RAISE;
END $$;

-- 1. Valid insert chain: platform -> region -> game -> product -> seller -> offer -> key
INSERT INTO platforms (slug, name, sort_order) VALUES ('pc', 'PC', 1);
INSERT INTO regions   (slug, name, sort_order) VALUES ('global', 'Global', 1);
INSERT INTO games (slug, title, genres, release_date, developer, publisher)
VALUES ('the-witcher-3', 'The Witcher 3: Wild Hunt', '{RPG,"Open World"}', '2015-05-19', 'CD PROJEKT RED', 'CD PROJEKT');
INSERT INTO products (game_id, platform_id, region_id, slug)
SELECT g.id, p.id, r.id, 'the-witcher-3-pc-global'
FROM games g, platforms p, regions r
WHERE g.slug = 'the-witcher-3' AND p.slug = 'pc' AND r.slug = 'global';
INSERT INTO sellers (slug, name, positive_feedback_pct, reviews_count) VALUES ('keyshop', 'KeyShop', 99.4, 1520);
INSERT INTO sellers (slug, name, positive_feedback_pct) VALUES ('gamevault', 'GameVault', 97.0);
INSERT INTO offers (product_id, seller_id, price_cents)
SELECT p.id, s.id, 1999 FROM products p, sellers s
WHERE p.slug = 'the-witcher-3-pc-global' AND s.slug = 'keyshop';
INSERT INTO keys (offer_id, code) SELECT id, 'AAAA-BBBB-CCCC' FROM offers;

SELECT pl.slug AS platform, r.slug AS region, g.title, p.edition, p.slug AS product,
       s.name AS seller, o.price_cents, o.is_active, k.code, k.status
FROM keys k
JOIN offers o    ON o.id = k.offer_id
JOIN sellers s   ON s.id = o.seller_id
JOIN products p  ON p.id = o.product_id
JOIN games g     ON g.id = p.game_id
JOIN platforms pl ON pl.id = p.platform_id
JOIN regions r   ON r.id = p.region_id;

-- 2. Each of these must be rejected
SELECT pg_temp.expect_error('duplicate platform slug',
  $q$INSERT INTO platforms (slug, name) VALUES ('pc', 'PC again')$q$, '23505')
UNION ALL SELECT pg_temp.expect_error('duplicate game slug',
  $q$INSERT INTO games (slug, title) VALUES ('the-witcher-3', 'Copy')$q$, '23505')
UNION ALL SELECT pg_temp.expect_error('badly formatted platform slug',
  $q$INSERT INTO platforms (slug, name) VALUES ('PS 5', 'PS5')$q$, '23514')
UNION ALL SELECT pg_temp.expect_error('offer with price_cents = 0',
  $q$INSERT INTO offers (product_id, seller_id, price_cents)
     SELECT p.id, s.id, 0 FROM products p, sellers s WHERE s.slug = 'gamevault'$q$, '23514')
UNION ALL SELECT pg_temp.expect_error('second offer for same product+seller',
  $q$INSERT INTO offers (product_id, seller_id, price_cents)
     SELECT p.id, s.id, 1499 FROM products p, sellers s WHERE s.slug = 'keyshop'$q$, '23505')
UNION ALL SELECT pg_temp.expect_error('key with status foo',
  $q$INSERT INTO keys (offer_id, code, status) SELECT id, 'K-2', 'foo' FROM offers$q$, '23514')
UNION ALL SELECT pg_temp.expect_error('reserved key without reserved_until',
  $q$INSERT INTO keys (offer_id, code, status) SELECT id, 'K-3', 'reserved' FROM offers$q$, '23514')
UNION ALL SELECT pg_temp.expect_error('available key with reserved_until',
  $q$INSERT INTO keys (offer_id, code, reserved_until) SELECT id, 'K-4', now() FROM offers$q$, '23514')
UNION ALL SELECT pg_temp.expect_error('sold key without sold_at',
  $q$UPDATE keys SET status = 'sold'$q$, '23514')
UNION ALL SELECT pg_temp.expect_error('duplicate key code for same offer',
  $q$INSERT INTO keys (offer_id, code) SELECT id, 'AAAA-BBBB-CCCC' FROM offers$q$, '23505')
UNION ALL SELECT pg_temp.expect_error('seller feedback 100.1 %',
  $q$INSERT INTO sellers (slug, name, positive_feedback_pct) VALUES ('x', 'X', 100.1)$q$, '23514')
UNION ALL SELECT pg_temp.expect_error('delete a game that has products',
  $q$DELETE FROM games WHERE slug = 'the-witcher-3'$q$, '23001');

ROLLBACK;

-- 3. After the rollback nothing is left
SELECT (SELECT count(*) FROM platforms) AS platforms, (SELECT count(*) FROM games) AS games,
       (SELECT count(*) FROM sellers) AS sellers, (SELECT count(*) FROM keys) AS keys;
```
Output:
```
-- valid chain: all 8 INSERTs succeeded
platform | region | title | edition | product | seller | price_cents | is_active | code | status
pc | global | The Witcher 3: Wild Hunt | Standard | the-witcher-3-pc-global | KeyShop | 1999 | t | AAAA-BBBB-CCCC | available

OK  duplicate platform slug -> rejected [23505] duplicate key value violates unique constraint "platforms_slug_key"
OK  duplicate game slug -> rejected [23505] duplicate key value violates unique constraint "games_slug_key"
OK  badly formatted platform slug -> rejected [23514] new row for relation "platforms" violates check constraint "platforms_slug_format"
OK  offer with price_cents = 0 -> rejected [23514] new row for relation "offers" violates check constraint "offers_price_positive"
OK  second offer for same product+seller -> rejected [23505] duplicate key value violates unique constraint "offers_product_seller_key"
OK  key with status foo -> rejected [23514] new row for relation "keys" violates check constraint "keys_status_valid"
OK  reserved key without reserved_until -> rejected [23514] new row for relation "keys" violates check constraint "keys_reserved_until_only_when_reserved"
OK  available key with reserved_until -> rejected [23514] new row for relation "keys" violates check constraint "keys_reserved_until_only_when_reserved"
OK  sold key without sold_at -> rejected [23514] new row for relation "keys" violates check constraint "keys_sold_at_only_when_sold"
OK  duplicate key code for same offer -> rejected [23505] duplicate key value violates unique constraint "keys_offer_code_key"
OK  seller feedback 100.1 % -> rejected [23514] new row for relation "sellers" violates check constraint "sellers_feedback_pct_range"
OK  delete a game that has products -> rejected [23001] update or delete on table "games" violates RESTRICT setting of foreign key constraint "products_game_id_fkey" on table "products"
-- ROLLBACK
platforms | games | sellers | keys
0 | 0 | 0 | 0
```
Note: the first run expected `23503` for the RESTRICT case and stopped there (the transaction was never committed). `ON DELETE RESTRICT` raises `23001 restrict_violation`; `23503 foreign_key_violation` is what the default `NO ACTION` raises. The expectation was corrected – the schema was not changed.

**Query sketches executed** (extra, not required). The four SQL sketches from `DATA_MODEL.md` were run on sample data (3 games, 4 products, 3 sellers, 5 offers incl. 1 inactive, 7 keys in all states) in another rolled-back transaction:
- Listing, no filters, sort by price: 3 rows (the product without offers is hidden, the inactive 9.99 € offer is ignored), `w3-pc-global` 1799 / 2 offers / in stock, `cp-pc-global` 2999 / in stock, `w3-ps5-europe-goty` 3499 / **out of stock** (only a sold key); `total_count = 3`. With `platform=pc, max 2500`: 1 row, `total_count = 1`.
- Product page `w3-pc-global`: GameVault 1799 **stock 1** (the expired reservation counts, the active reservation and the sold key do not), KeyShop 1999 stock 2.
- Reserve 2 from GameVault → **1 row** (only the expired one; Go would `ROLLBACK`: not enough stock). Reserve 2 from KeyShop → 2 rows; product page then shows stock 0 / 0.
- Search: `witcher` → score 1.00, `witchr` → 0.71, `cyberpnk` → Cyberpunk 2077 0.67.
- `EXPLAIN` (with seq scans disabled, because the tables are tiny): the search uses `games_title_trgm_idx` for **both** `ILIKE` and `<%` (`BitmapOr`); "active offers of a product by price" is an `Index Scan using offers_active_product_price_idx` with **no Sort**; the per-offer stock count is an `Index Only Scan using keys_unsold_offer_idx`; the reserve query uses `keys_unsold_offer_idx` + `LockRows`.
- After `ROLLBACK`: `games` count 0.

## 3. What the owner must do manually
1. **Open the PR.** `gh` is installed now but not logged in, so I pushed the branch and did not open a PR. Either the browser: https://github.com/dovydas472/ENEBA-homework/pull/new/task/05-data-model or:
   ```
   gh auth login --hostname github.com --git-protocol https --web
   gh pr create --base main --head task/05-data-model --title "Task 05: data model design + catalog migration" --body-file .github/pull_request_template.md
   ```
2. **Check that the Mermaid diagrams render** on GitHub (open `docs/DATA_MODEL.md` on the branch): the ER diagram (planned tables are labelled "(planned)") and the two state diagrams.
3. **After the merge:** *Actions → "Migrate production"* runs automatically (the merge touches `migrations/**`). Expected in "Apply migrations": `applied  00002_catalog.sql (…)`; "Show migration status": both files `applied`. Optional, Neon SQL editor on `production`: `select version_id from goose_db_version order by id;` → 0, 1, 2.
4. Answer the open questions (section 6); any change becomes a **new** migration (`00003_…`), `00002` is not edited after the merge.

## 4. Plain-language explanation
The catalog has two levels: a **game** (The Witcher 3) and the **products** you can actually buy (the same game on PC for "Global", on PS5 for "Europe" in the GOTY edition …). **Platforms** and **regions** are small lookup tables for the filters. Many **sellers** make an **offer** (their price in cents) for a product, and every offer has its own **keys** – one row per activation code.

Two numbers the store shows are never stored: **stock** is "how many keys of this offer can still be sold", and the **cheapest price** is the minimum over active offers. They are calculated by queries, so they can never get out of sync. Indexes make those queries cheap: the offer index returns a product's offers already sorted by price, and the key index contains only unsold keys, so counting stock reads only that index.

A key is `available`, `reserved` (someone is checking out, until `reserved_until`) or `sold`. A reservation that has expired simply counts as available again, so no background job is needed. Checkout takes keys with `FOR UPDATE SKIP LOCKED`: the chosen rows are locked, and a second buyer at the same moment skips them instead of waiting, so two people can never get the same key.

The database itself enforces the rules (prices > 0, valid statuses, "reserved ⇔ has a reservation time", unique slugs, no deleting a game that still has products). Go will validate too, but the database is the last line of defence against any bug, seed script or manual SQL.

Users, sessions, orders, order items and payments are already designed in `docs/DATA_MODEL.md` and will be created in their own tasks.

## 5. Deviations from the task and why
- **Slug format CHECK allows digits:** the task says "lowercase/`-` only", but real slugs need digits (`ps5`, `cyberpunk-2077`). Regex: `^[a-z0-9]+(-[a-z0-9]+)*$` (also forbids leading/trailing/double `-`).
- **Choices where the task was not specific** (please confirm): ids are `bigint GENERATED ALWAYS AS IDENTITY`; every column not marked "null" is `NOT NULL`; `developer` is nullable (I read "`developer`, `publisher` (null)" as both); `reviews_count` has `DEFAULT 0`, `positive_feedback_pct` has no default; `keys.sold_at` CHECK is "set **iff** sold" (same shape as `reserved_until`); constraints have explicit names (readable errors); Down uses `DROP TABLE IF EXISTS` (like `00001`).
- **Additions:** a 4th query sketch (title search) to justify the trigram index; the query sketches were executed and EXPLAINed on `dev` (see section 2); 6 extra negative cases in the constraint test; a README layout line.
- **Planned tables** (`users`, `sessions`, `orders`, `order_items`, `payments`, `keys.order_item_id`) are my design within P4/P5/P7 and the earlier decisions – details such as `orders.expires_at`, the partial UNIQUE "one succeeded payment per order", `sessions → users ON DELETE CASCADE` and the `(user_id, idempotency_key)` UNIQUE are proposals for the auth/checkout tasks (see open questions).

## 6. Open questions
Implemented as listed; these are suggestions, each would be a new migration:
1. **Slug format CHECK on `games`, `products`, `sellers` too?** Only `platforms`/`regions` have it (as listed). The same regex everywhere would keep all URLs safe.
2. **Non-empty text CHECKs** (`title <> ''`, `name <> ''`, `code <> ''`)? `NOT NULL` still allows an empty string.
3. **Cheapest price vs stock (P2):** the listing price is MIN over *active* offers, even an offer with 0 sellable keys. Should the cheapest price (and the price filter) consider only offers that have stock? Correct per P2 today, but a card could show a price nobody can buy at.
4. **`positive_feedback_pct` for a seller with 0 reviews** must be a number today (NOT NULL). Make it nullable ("no rating yet")?
5. **`offers.updated_at`** is set by the `UPDATE` statement (no trigger). OK, or add a small trigger so it can never be forgotten?
6. **No index on `offers.seller_id`** (only needed for "offers of a seller" or deleting a seller). Add when a seller page appears?
7. **Reservation length:** sketches use 15 minutes – confirm.
8. **Order snapshot:** decided = price + product title. Also snapshot the seller name in `order_items`?
9. **Cart:** not part of the model – assumed to live in the browser and be sent at checkout. Confirm (otherwise a `cart_items` table is needed).
10. **`sessions → users ON DELETE CASCADE`** is the only exception to RESTRICT – confirm for the auth task.
11. **AI log of the Task 04 session** was never committed (the Task 04 report says its session was still running). Should I convert and commit it too?
