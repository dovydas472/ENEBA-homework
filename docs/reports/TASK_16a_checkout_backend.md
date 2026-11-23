# Task 16a – Checkout backend: orders, key reservation, mock payment, order history: report

Task file: [`docs/tasks/TASK_16a_checkout_backend.md`](../tasks/TASK_16a_checkout_backend.md) · Branch: `task/16a-checkout-backend` · PR #17 · **This PR has a migration (`00005_orders.sql`): production is migrated from this branch BEFORE the merge (§3, step 1).**

## 1. Files changed

**Database**
- `migrations/00005_orders.sql` (created with `go run ./cmd/migrate create orders`): `orders` (uuid id, status CHECK, `total_cents`, `idempotency_key` with `UNIQUE (user_id, idempotency_key)`, `reserved_until`, `paid_at` set iff paid), `order_items` (order CASCADE, offer, quantity 1–5, price + text snapshots, `UNIQUE (order_id, offer_id)`), `payments` (outcome CHECK, partial UNIQUE: one `succeeded` per order), `keys.order_item_id` (nullable FK, partial index, CHECK "an available key has no order item"). New tables + a nullable column → backward compatible.

**Go – `pkg/orders` (new)**
- `rules.go`: **all business rules, pure functions**, indexed as R1–R9 at the top: `ValidateItems` (limits), `ReviewLine` (re-pricing and change detection), `HasChanges`, `TotalCents`, `ReservedUntil`, `EffectiveStatus` (lazy expiry), `DecidePay` / `DecideCancel` (state machine), `VisibleKeys` (keys only when paid), the error values.
- `store.go`: the transactions. `Quote`, `CreateOrder` (idempotency lookup → `FOR SHARE` on the offers → `INSERT … ON CONFLICT DO NOTHING` → items + `reserveKeys` with `FOR UPDATE SKIP LOCKED` → commit or roll back with the change list), `ListOrders`, `GetOrder`, `PayOrder` (order row `FOR UPDATE`), `CancelOrder`. The clock is injected (`WithClock`).
- `types.go`: the JSON types of the contract. Tests: `rules_test.go` (unit), `store_integration_test.go` (19 tests on a real Postgres, run in CI).

**Go – elsewhere**
- `pkg/server/orders_handlers.go` (+ `orders_handlers_test.go`, fake store): the six handlers, `OrderStore` interface, error → status mapping. `router.go`: routes, 405s, `Deps.Orders`. `api/index.go`, `cmd/local/main.go`: pass `orders.NewStore(lazyDB)`.
- `pkg/seedgen/db.go`: `Reset` refuses while orders exist (`ErrOrdersExist`) – see §5. `pkg/testdb/testdb.go`: wipes the commerce tables before the test seed; doc note about `-p 1`.

**CI** – `.github/workflows/ci.yml`: `go test -p 1 ./...`; the "tests ran, not skipped" step includes `./pkg/orders` and requires `TestK6_twoBuyersOneLastKey`, `TestK6_manyBuyersFewKeys`, `TestPay_concurrentDoubleClickChargesOnce` to pass.

**Frontend (no UI)** – `src/api/types.ts` (checkout types), `src/api/orders.ts` (`quoteCart`, `createOrder`, `listOrders`, `getOrder`, `payOrder`, `cancelOrder`, `newIdempotencyKey`, `cartChangedLines`, `isPaymentDeclined`, `isReservationExpired`), `src/api/orders.test.ts`.

**Docs** – `docs/DATA_MODEL.md` (tables, both state machines and sketches 3 / 3b as built, ER diagram), `README.md` ("Checkout (Task 16a)": endpoints, rules, shortcuts, how to run the DB tests), `docs/PAAISKINIMAI_LT.md` (Task 16a block: SKIP LOCKED vs SELECT-then-UPDATE, idempotency key, lazy expiry, why 404, why the server re-prices, the K6 test).

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...`, `go test ./...` | pass. `go.mod` untouched (`go 1.25.0`). Integration tests **skip locally** (no Postgres on this machine) |
| **CI on PR #17** (Postgres 18, job `migrations`) | **all green: `go`, `migrations`, `frontend`, Vercel**. "Tests ran" step: `catalog + auth + orders tests: 139 passed, 0 skipped`. All 19 orders integration tests passed, among them `TestK6_twoBuyersOneLastKey` (25 rounds), `TestK6_manyBuyersFewKeys` (10 buyers, 4 keys), `TestCreate_concurrentDuplicatesMakeOneOrder`, `TestPay_concurrentDoubleClickChargesOnce`, `TestPay_expiredReservationIs409AndReleasesTheKeys`, `TestExpiredReservation_isTakenOverAndTheOldOwnerCannotSellIt`, `TestDatabaseGuards`. Migration up → every Down one by one → up again worked |
| First CI run | **failed once**: one of my own tests asked for 2 keys when 1 was left (a test bug, not a code bug). Fixed in `e1a49e3`; everything else had already passed |
| `npm run lint`, `npm test` (PowerShell), `npm run build` | pass (38 files, 476 tests) |
| Migration on Neon **dev** | `migrate up` → `down` → `up`: fine |
| **End-to-end on dev** (`cmd/local` on 127.0.0.1:8095, scratchpad script, through the PgBouncer pooler) | **29/29 checks**: public quote; create `201`, same key `200` (same id); keys `[]` while pending; another user's get / pay / cancel → `404` and malformed id → `404`; decline `402` (order stays pending), bad outcome `400`, success `200` with 2 `DEMO-…` keys, pay twice `200` same keys, cancel a paid order `409`; list newest first with `itemCount`; price changed → `409 cart_changed` / `price_changed` and nothing created; validation `400`s; cancel `200`; foreign Origin `403`; signed out `401`. Server stopped afterwards, nothing on 0.0.0.0 |
| Seed checksum | unchanged (no seed change; the golden test passes) |

Not done locally: the integration tests were **not run on this machine** (no Postgres; I tried a portable build but the sandbox refused to start it, so I did not use it). They ran in CI, and the same flows were exercised by hand on the dev branch.

## 3. What the owner must do manually
1. **Before the merge:** *Actions → Migrate production → Run workflow* with "Use workflow from" = **`task/16a-checkout-backend`**; check that the log shows `00005_orders.sql` applied. After that the migration file must not change.
2. Merge PR #17 (the automatic run after the merge finds nothing to apply).
3. Optional check on the Preview / production site: sign in as the demo user in a browser, then in the DevTools console run `await (await fetch('/api/orders')).json()` (expect `{"orders":[]}`) and `await (await fetch('/api/checkout/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{offerId:1,quantity:1,expectedPriceCents:1}]})})).json()` (a line with `price_changed`, quantity capped by stock). The session cookie is HttpOnly, so `curl` needs the cookie copied by hand.
4. Run `/export` and commit the session log in `ai-logs/` on this branch (not possible from inside the session).
5. Local DB tests, if wanted: a throw-away Postgres in `TEST_DATABASE_URL` and `go test -p 1 ./...` (README).

## 4. Plain-language explanation
The cart lives in the browser. When the buyer checks out, the browser sends the lines with the price it *saw*. The server looks everything up again; if a price, the stock or an offer's state differs, it creates nothing and answers with every line and what changed (`409 cart_changed`). Otherwise, in **one database transaction**, it creates a pending order, copies what was bought into the order items (a snapshot) and **reserves the keys for 15 minutes**.

"Never sell a key twice" rests on one SQL statement: it picks N free keys, locks them (`FOR UPDATE`) and skips any key another buyer has already locked (`SKIP LOCKED`). Two buyers fighting for the last key: one locks it, the other finds nothing, rolls back and is told the cart changed. The K6 test fires exactly that 25 times with real goroutines and transactions.

"Never charge twice": the browser sends a random `idempotencyKey` per checkout attempt, and the database has `UNIQUE (user_id, idempotency_key)`, so a double click or a retry gets the same order, even when two identical requests arrive at the same instant. Paying locks the order row, so two pay clicks run one after another; the second sees "paid" and returns the order unchanged; a partial unique index additionally allows only one successful payment per order.

"Expiry without a job": nothing runs in the background. A key whose reservation has ended simply counts as available, and an order past `reservedUntil` is shown as `expired`. Paying too late stores `expired`, frees the keys and answers `409`. If someone else already took over a key, the old owner's payment finds fewer keys than it needs and sells nothing – a key is only sold when it still carries the order's own `order_item_id`.

Keys are returned only for a paid order and only to its owner; any other user gets `404` (the same as for an id that does not exist), so the API never reveals that an order exists.

## 5. Deviations from the task and why
- **`seedgen.Reset` refuses while orders exist** (`ErrOrdersExist`) and `testdb` wipes the commerce tables first. Not in the task, but a consequence of it: orders and keys now reference offers (RESTRICT), so a `--reset` would fail halfway with a raw FK error, and deleting orders silently would destroy order history. Side effect: `cmd/seed --reset` on a database that has demo orders now stops with a clear message. Documented in the README. Easy to remove if you prefer.
- **CI: `go test -p 1 ./...`**, and `./pkg/orders` + three named tests in the "tests ran" step. `pkg/catalog` re-seeds the tables that `pkg/orders` builds rows in; in parallel they would delete each other's data. (The earlier CI comment already said to do this once a second package resets the catalog.)
- **`keys` CHECK is one-directional** (`status <> 'available' OR order_item_id IS NULL`), not `(status = 'available') = (order_item_id IS NULL)` as the old DATA_MODEL plan said: the seed contains `reserved` and `sold` keys without orders, which the stronger form would reject. Also an extra partial index on `keys.order_item_id` and the partial UNIQUE on succeeded payments.
- **DATA_MODEL differences from the earlier plan**, now documented as built: status `cancelled` instead of `failed`, `reserved_until` instead of `expires_at`, no `updated_at`, `payments.outcome` instead of `status`, no `failure_reason`, snapshots split into six columns, `order_items → orders` is `ON DELETE CASCADE` (as the task says).
- **Contract details the task left open:** `itemCount` = number of keys (sum of quantities); an unknown offer id in a cart gives a line with `unavailable`, empty texts and `coverUrl: null`; a repeated offer in one request is `400`; a stale idempotent retry is answered with the stored order even if the cart would no longer be valid.
- **GET does not write:** an expired pending order is shown as `expired` but the row changes only when pay or cancel finds it (the task allowed either).
- The migration file was created with `go run ./cmd/migrate create orders` and then filled in (I had first written it by hand and redid it with the official command).

## 6. Open questions
1. **Reservation hoarding (found by the automated security review).** Nothing limits how many pending orders one user can hold, and there is no rate limit on `POST /api/orders`; a scripted demo user could reserve all keys of an offer for 15 minutes at a time. I did **not** add a cap because it is a new product decision and the task did not ask for it. Options: at most N (e.g. 3) pending orders per user and/or a quota of reserved keys, checked inside the create transaction; a per-user rate limit. Do you want that in this PR or a follow-up?
2. **Stock shown in the 409 lines** while a competing order is still in flight is "what this request could actually take" (that is why the K6 loser sees `unavailable`, never a stale `ok`). Fine for the UI?
3. **Production clock:** reservation times come from the application server's clock, not the database's; seconds of skew are irrelevant against 15 minutes, and the pay step has a second safeguard (keys must still carry the order's own item id). Acceptable?

## 7. Self-review (output of the `task-reviewer` subagent)

**Verdict: CHANGES NEEDED – only declarations, no code changes.** It checked 31 requirements: 29 *done*, 2 *missing (expected at that stage)*: this report and the session log. It found **no CLAUDE.md violations** (only Go file in `/api`, logic in `pkg/`, `go.mod` untouched, no secrets, money in cents, no raw `fetch`, no edited migration, noreply identity, DATA_MODEL updated, no disabled lint rule).

| Finding | What was done |
|---|---|
| Scope extras to declare as deviations: `seedgen.Reset` refusal, the `testdb` wipe, the CI `-p 1` change, the extra CHECK / index on `keys` | Declared in §5 with the reason for each; the owner can ask to drop any of them |
| The report must list the pre-merge "Migrate production" step first | §3, step 1 (and the PR checklist) |
| The report must say whether the integration tests ran locally or only in CI | §2: **only in CI** (plus a manual end-to-end run on the dev branch); not run locally |
| Only `quoteHandler` sets its own timeout; the other handlers pass `r.Context()` | Not a gap: the signed-in handlers run behind `requireUser`, which already wraps the request context in the 10 s `requestTimeout` (same as the auth handlers); only the public quote needs its own |
| At exactly `now == reserved_until` the order reads as `expired` while the key is not yet sellable (`<` vs `!Before`) | Intended and safe: the order is declared over one instant before its key becomes free, so a key can never be sold and re-reserved at the same moment. Interview answer: "the boundary errs on the side of never double-selling" |
| Verbatim task file not byte-checked | The file was saved exactly from the task text as the first commit |

**Automated security review (separate hook):** *business-logic / inventory hoarding* (no cap on pending orders per user, no rate limit) – see open question 1; not changed because it is a product decision outside the task.
