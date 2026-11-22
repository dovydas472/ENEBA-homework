# Task 16b – Checkout UI: cart page, payment page, orders and keys

**Model:** Opus · **Effort:** high
**Runs in parallel with Task 16a** (backend). Another session works in the main folder, so use a worktree:
```
git worktree add ../ENEBA-homework-16b -b task/16b-checkout-ui origin/main
```
Build against the API contract in `docs/tasks/TASK_16a_checkout_backend.md` §4 (also on the 16a branch). Until 16a is merged use mocked `apiFetch` in tests and a small local mock (scratchpad, 127.0.0.1) for the browser check. After 16a is merged: rebase on `main`, verify against the real API, then ask for review. Remove the worktree after the PR is opened.

## Decisions (made by the owner – do not change)
- **Cart page `/cart`** (Eneba parity – compare with eneba.com's cart, CLAUDE.md rule):
  - lines: cover, title, edition (if not Standard), platform · region, seller, quantity stepper (1 … `maxQuantity`), remove, line total; summary with total and **"Checkout"**; empty state with "Browse the store".
  - On load (and when the cart changes) call `POST /api/checkout/quote` and update the stored lines from the answer. Show per-line notices: **"Price updated: €x → €y"**, **"Only N left – quantity reduced"**, **"No longer available"** (line disabled, can be removed; excluded from the total and from checkout).
- **Checkout** requires sign-in: not signed in → `/login?next=/cart`.
  - Generate an `idempotencyKey` per checkout attempt and keep it (sessionStorage) until the order is created or the cart changes, so a double click or a retry after a network error never creates two orders.
  - `201`/`200` → go to `/checkout/:orderId`. `409 cart_changed` → apply the returned lines to the cart, show the notices, the user presses "Checkout" again.
- **Payment page `/checkout/:orderId`:**
  - order summary; a **countdown** "Reserved for mm:ss" based on `reservedUntil` and `serverTime` (correct for clock differences);
  - a clearly labelled box **"Simulated payment – no real money, no card details"** with a choice **Success / Decline** (radio) and **"Pay €X"** (disabled while the request runs; double clicks are safe);
  - **no card number / CVC / expiry fields anywhere** (phishing-risk rule);
  - decline → error message, try again; expired → message + "Back to cart" (the cart is still there); "Cancel order" → back to the cart;
  - success → remove the purchased lines from the cart → `/orders/:id`.
- **Orders `/orders`** (signed in): list with date, items count, total, status badge (Paid / Pending payment / Expired / Cancelled); a pending order links to its payment page. Empty state.
- **Order detail `/orders/:id`:** items with snapshots; for a paid order each key is shown **masked** (`DEMO-••••-••••-••••`) with **"Reveal"** and **"Copy"** (clipboard + "Copied" toast); pending → "Complete payment" link. Unknown/other user's order → 404 page.
- Header cart badge and toasts as before. No dead UI. Eneba look (cart and order pages); our wording.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/16b-checkout-ui`, in the worktree).

## 2. Tests (Vitest)
Cart page: quote applied (price change, quantity reduced, unavailable), stepper limits, remove, empty state, total excludes unavailable lines. Checkout: redirect when signed out; one idempotency key reused on retry/double click; 409 applies lines. Payment page: countdown (fake timers + server time offset), decline message, expired state, success clears purchased lines and navigates. Orders list/detail: statuses, masked keys, reveal, copy.

## 3. Verify
After rebasing on 16a: real browser against the local API (`dev`): full flow (add 2 items → cart → sign in as demo → checkout → decline → success → order with keys → reveal/copy → orders list); a price-change/stock case (use the quote change list); expiry (shorten time in a mock or ask how to simulate – do not change production code for it). Screenshots desktop + phone; axe 0; comparison table vs eneba.com.

## 4. Docs
`docs/PAAISKINIMAI_LT.md`: the client side of idempotency; countdown with server time; why the cart re-quotes; why no card fields; masked keys and clipboard.

## Report
As defined in `CLAUDE.md` (incl. comparison table, Self-review). Export the session log at the end and commit it on this branch.
