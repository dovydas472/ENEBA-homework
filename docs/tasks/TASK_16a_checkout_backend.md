# Task 16a – Checkout backend: orders, key reservation, mock payment, order history

**Model:** Opus · **Effort:** high
Runs **in parallel with Task 16b** (UI, separate worktree) against the API contract below. Merge 16a first.
This PR has a **migration** → owner runs *Migrate production* from this branch before merging (CLAUDE.md).

## Goal
The purchase flow is one of the two "deep" parts: correct under concurrency, never sells a key twice, never charges twice, survives double clicks and expired reservations – and is easy to explain.

## Decisions (made by the owner – do not change)
- **K1** Flow: cart (browser) → `POST /api/orders` creates a **pending** order and **reserves keys for 15 minutes** → payment page → `POST /api/orders/{id}/pay` with a **mock outcome** (`success` | `decline`) → paid order with keys.
- **K2** The server is the source of truth: it re-checks price, stock and offer status. If anything changed, **no order is created** and the response lists exactly what changed per line.
- **K3** `decline` → order stays **pending**; the user may pay again while the reservation is valid. After expiry: `409 "Reservation expired"`, order becomes `expired`, keys are free again.
- **K4** **Idempotency:** the client sends an `idempotencyKey` (UUID) when creating an order; the same key from the same user returns the same order (no second order, no second reservation). Paying an already paid order returns it unchanged (no second payment row with success).
- **K5** Keys are returned **only for paid orders and only to their owner**. Another user's order → `404` (do not reveal it exists).
- **K6** CI integration test: **two buyers, one last key** – exactly one gets the order, the other gets a "changed" response; no key is reserved twice.
- Earlier decisions: integer cents; order items snapshot product title, edition, platform, region, seller name and unit price; keys picked with `FOR UPDATE SKIP LOCKED`; lazy expiry (a reserved key with `reserved_until < now()` counts as available); all endpoints `Cache-Control: no-store`; `requireUser` + Origin check from Task 14; 503/500 rules.
- Limits: max **20 lines** per order, quantity **1–5** per line and ≤ available stock.
- No clean-up job for demo users/orders (documented shortcut).

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/16a-checkout-backend`).

## 2. Database – migration `00005`
Following `docs/DATA_MODEL.md` (planned tables – update it):
- `orders`: `id uuid` (default `gen_random_uuid()`), `user_id` → users, `status` (`pending` | `paid` | `expired` | `cancelled`, CHECK), `total_cents`, `idempotency_key`, `reserved_until`, `created_at`, `paid_at` (set only when paid – CHECK); `UNIQUE (user_id, idempotency_key)`.
- `order_items`: order (cascade), `offer_id`, quantity, `unit_price_cents`, snapshots (product slug, title, edition, platform name, region name, seller name).
- `keys.order_item_id` (nullable FK + index): set when a key is **reserved** for an order item, so ownership of a reservation is explicit.
- `payments`: order, `outcome` (`succeeded` | `declined`), `amount_cents`, `created_at`.
- Backward compatible (new tables + nullable column).

## 3. Rules that must hold (put them in one place in Go, comment each)
- **Create order** (one transaction): validate lines → lock and take keys per line with `SKIP LOCKED` (available, or reserved but expired) → if any line cannot get its quantity, or price/active state differs from what the client expected → roll back, return the change list → otherwise insert order + items, mark keys `reserved` with `reserved_until` and `order_item_id`.
- **Pay** (one transaction, order row locked `FOR UPDATE`): paid → return as is; expired/cancelled → 409; reservation time passed → mark `expired`, release its still-reserved keys, 409; `decline` → payment row `declined`, 402; `success` → verify **all** reserved keys of this order still belong to it and are not expired (count = total quantity), mark them `sold` with `sold_at`, order `paid`, payment row `succeeded`.
- **Cancel** pending order → `cancelled`, release keys.
- Reading an order whose pending reservation has passed shows status `expired` (lazy; may also persist it).
- Inject time (a clock interface or pass `now`) so tests can simulate expiry without sleeping.

## 4. API contract (16b builds against exactly this; camelCase JSON)
- `POST /api/checkout/quote` (no sign-in needed) `{ items: [{ offerId, quantity, expectedPriceCents }] }` → `200 { lines: [Line], totalCents }`.
  `Line` = `{ offerId, quantity, unitPriceCents, stock, maxQuantity, available, productSlug, title, edition, platformName, regionName, sellerName, coverUrl, changes: [ "price_changed" | "quantity_reduced" | "unavailable" ] }` (`quantity` is what can actually be bought; `unavailable` = offer inactive or stock 0).
- `POST /api/orders` (signed in) `{ idempotencyKey, items: [{ offerId, quantity, expectedPriceCents }] }` →
  `201 { order: Order }` · same key again → `200 { order }` · anything changed → `409 { error: "cart_changed", lines: [Line] }` · validation `400`.
- `GET /api/orders` → `200 { orders: [ { id, status, totalCents, itemCount, createdAt, reservedUntil } ] }`, newest first.
- `GET /api/orders/{id}` → `200 { order: Order, serverTime }` · not yours / unknown → `404`.
- `POST /api/orders/{id}/pay` `{ outcome: "success" | "decline" }` → `200 { order: Order }` (paid; also when already paid) · `402 { error: "Payment declined (simulated)" }` · `409 { error: "Reservation expired" }` (or "Order is not payable").
- `POST /api/orders/{id}/cancel` → `200 { order }` · `409` if not pending.
- `Order` = `{ id, status, totalCents, createdAt, reservedUntil, paidAt, items: [ { offerId, productSlug, title, edition, platformName, regionName, sellerName, unitPriceCents, quantity, keys: [string] /* only when paid */ } ] }`.
- Add the types and functions to `src/api/types.ts` / `src/api/orders.ts` (no UI).

## 5. Tests
- Unit: validation, change detection, idempotency, status transitions, the "keys only when paid" rule.
- Integration (CI): happy path (create → pay success → keys returned, keys `sold`); decline then success; expiry (simulated time) → 409, keys free and buyable by another user; cancel releases; idempotent create (same key twice → one order, one reservation); double pay → one succeeded payment; price changed → 409 with `price_changed`; another user's order → 404; **K6 two buyers / last key** (two goroutines, real transactions) – run it a few times in a loop in the test.
- Seed checksum unchanged (no seed change).

## 6. Docs
`docs/DATA_MODEL.md` (tables, state machines as built), README (checkout API, shortcuts: simulated payment, no clean-up), `docs/PAAISKINIMAI_LT.md`: reservation with `SKIP LOCKED` and why not `SELECT … then UPDATE`; idempotency key; lazy expiry; why 404 for other users' orders; why the server re-prices; the K6 test and what it proves.

## 7. Owner steps (list in the report)
Before merge: *Migrate production* from `task/16a-checkout-backend` → `00005` applied. Then merge.

## Report
As defined in `CLAUDE.md` (incl. Self-review). Export the session log at the end and commit it on this branch.
