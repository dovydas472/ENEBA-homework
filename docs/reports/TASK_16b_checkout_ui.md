# Task 16b – Checkout UI: cart page, payment page, orders and keys: report

Task file: [`docs/tasks/TASK_16b_checkout_ui.md`](../tasks/TASK_16b_checkout_ui.md) · Branch: `task/16b-checkout-ui` (worktree `../ENEBA-homework-16b`) · API contract: Task 16a §4 · **No migration in this PR.**

## 1. Files changed

**API layer (`src/api/`)**
- `types.ts` – the checkout / order types of the 16a contract (§4).
- `orders.ts` (new) – `quoteCart`, `createOrder`, `getOrders`, `getOrder`, `payOrder`, `cancelOrder`, and error readers: `cartChangedLines` (409 `cart_changed`), `isReservationExpired`, `isHttpStatus`, `orderErrorMessage` (server text only for 400/402/409, otherwise generic).
- `post.ts` (new) – `postJSON`, moved out of `auth.ts` so `auth.ts` and `orders.ts` share it (a separate module so the tests' `apiFetch` mock still applies, see §5).
- `auth.ts` – imports `postJSON` from `post.ts`.
- `queries.ts` – keys `orders`, `orderList`, `order(id)`, `cartQuote(items)`; `orderListQuery`, `orderQuery` (`staleTime: 0`).

**Cart rules and store (`src/features/cart/`)**
- `cart.ts` – `checkoutItems` (lines → `{offerId, quantity, expectedPriceCents}`, unavailable left out), `applyQuoteLines` (the server's price / stock / quantity / display data; an unavailable line is kept unchanged so the stored cart stays valid), `removePurchased`.
- `cartStore.ts` – `applyQuote`, `removePurchased`, both through `commitIfChanged` (no re-render / re-quote loop).

**Checkout (`src/features/checkout/`, new)**
- `lineStatus.ts` – per-line notices ("Price updated: €x → €y", "Only N left – quantity reduced", "No longer available"), `mergeAnswer`, `clearNotices`, `unavailableOffers`, `hasNotices`.
- `lineStatusStore.ts` – the statuses outside React (`useSyncExternalStore`) and `applyServerAnswer` (the one place a quote or a 409 reaches the cart).
- `attemptKey.ts` – the idempotency key per checkout attempt: `sessionStorage` + cart fingerprint.
- `countdown.ts` – `clockOffsetMs`, `remainingMs`, `formatCountdown` (server clock).
- `useCartQuote.ts`, `useCheckout.ts` – the quote query and the "Checkout" mutation.
- `CartView.tsx`, `CartLineItem.tsx`, `QuantityStepper.tsx`, `PaymentView.tsx` (+ `.module.css`), `CheckoutLayout.module.css` (shared two-panel layout).
- `fixtures.ts`, `testApp.tsx` – test helpers (imported only by `*.test.ts(x)`, so not in the bundle; same pattern as `features/product/fixtures.ts`).

**Orders (`src/features/orders/`, new)** – `OrderList.tsx`, `OrderView.tsx`, `OrderItemList.tsx`, `KeyList.tsx` (masked keys, Reveal / Copy), `StatusBadge.tsx`, `OrderLoading.tsx` (+ CSS), `orderText.ts` (`maskKey`, `statusLabel`, `shortOrderId`, `itemCountText`).

**Pages and routes** – `src/pages/CartPage.tsx` (was a placeholder), `OrdersPage.tsx` (was a placeholder), `OrderPage.tsx` (new), `CheckoutPage.tsx` (new); `src/app/routes.ts`: `orders/:id` and `checkout/:orderId` inside `RequireAuth`.

**Other code** – `src/features/auth/useCurrentUser.ts` (cached orders dropped on sign in / sign out), `RequireAuth.tsx` (comment), `src/lib/useNow.ts` (new), `src/lib/formatDate.ts` (`formatDateTime`), `src/styles/tokens.css` (5 tokens, below).

**Tests** – new: `src/api/orders.test.ts`, `src/features/checkout/checkoutRules.test.ts`, `src/features/orders/orderText.test.ts`, `src/pages/CartPage.test.tsx`, `CheckoutPage.test.tsx`, `OrdersPage.test.tsx`.
Changed (Task 14 tests used `/orders` as "the protected page" and read its placeholder text): `src/features/auth/fakeAuthServer.ts` (answers `GET /api/orders` with an empty list), `src/app/routes.test.tsx`, `src/app/AccountMenu.test.tsx`.

**Docs** – `docs/DESIGN.md` (S6 source; token `--color-surface-line` in 2.1; layout tokens in 2.4; 3.6 Eneba's cart measured + as built for cart, payment, orders; 5.1 contrast rows; 6 research notes),
`docs/PAAISKINIMAI_LT.md` (Task 16b block), this report, `docs/reports/assets/task16b_*.png` (our screenshots), `docs/tasks/TASK_16b_checkout_ui.md`.

**Tokens added:** `--color-surface-line` `rgba(0,0,0,.12)`, `--checkout-max-width` 1010px, `--checkout-side-width` 355px, `--cart-cover-width` 90px / `--cart-cover-width-sm` 50px, `--key-action-min-width` 90px.

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...` / `go vet ./...` / `go test ./...` | pass (no Go changes in this PR) |
| `npm run lint` | 0 problems |
| `npm test` (PowerShell) | **43 files, 530 tests pass** (new: 17 cart page + checkout, 13 payment page, 8 orders, 20 checkout rules, 6 order text helpers, 7 API error readers) |
| `npm run build` | OK |
| Tests can fail (mutation check) | Checkout with a new UUID per click instead of `checkoutAttempt.keyFor` → the "retry sends the SAME key" test fails; countdown without the server-clock offset → 5 payment-page tests fail. Both restored. |
| **Browser, mock API** (headless Edge → `vite preview` 127.0.0.1:4196 → a mock of the 16a API on 127.0.0.1:8096, scratchpad) | **49/49**: empty cart; 2 lines + total; price change / stock reduced / unavailable notices, total without the unavailable line, stored cart updated; remove; Checkout signed out → `/login?next=%2Fcart` → demo → back to `/cart`; Checkout → payment page; countdown; only two radios (no card fields); decline message; success → order page, cart emptied, toast; keys masked, Reveal, Copy (clipboard read back) + "Copied"; orders list; **409 `cart_changed`** (price changed between quote and click) → notice, second press creates the order; Cancel order → `/cart`; pending order links to its payment page; **expiry** (5 s reservation in the mock) → "Your reservation has expired" + Back to cart, cart kept; unknown order → 404; phone pages; no horizontal overflow |
| **Browser, REAL 16a API** (`cmd/local` built from `origin/task/16a-checkout-backend` on 127.0.0.1:8097, Neon **dev**, migration 00005 already there) | **22/22**: two products added from the Store; fresh lines without notices; the quote change list (a stale price and 5 of an offer with stock 3 in localStorage) → "Price updated: €12.99 → €11.99" + "Only 3 left – quantity reduced", price written back; signed out → login → demo → cart; real order + countdown 15:00; decline `402`; success → 2 `DEMO-…` keys masked, Reveal, Copy; `/orders` newest first; the payment page of a paid order → its order page; unknown order → 404 |
| axe-core (WCAG 2 A/AA, 2.1 AA, best practice) | **0 violations** on: empty cart, cart, cart with notices, payment, payment declined, payment expired, order (paid), orders (desktop); cart with notices, payment, order, orders (phone); and on the real-API cart with notices, payment and order |
| Loopback | mock 127.0.0.1:8096, real API 127.0.0.1:8097, preview 127.0.0.1:4196; nothing on 0.0.0.0. Scripts, the mock, the preview config and Eneba's reference screenshots stayed in the session scratchpad; all servers stopped afterwards |

**Screenshots (ours):** `docs/reports/assets/task16b_cart-empty-desktop.png`, `task16b_cart-desktop.png`, `task16b_cart-notices-desktop.png`, `task16b_payment-desktop.png`, `task16b_payment-declined-desktop.png`, `task16b_payment-expired-desktop.png`,
`task16b_order-desktop.png`, `task16b_order-revealed-desktop.png`, `task16b_orders-desktop.png`, `task16b_cart-mobile.png`, `task16b_payment-mobile.png`, `task16b_order-mobile.png`, `task16b_orders-mobile.png`;
real API: `task16b_real-cart-desktop.png`, `task16b_real-cart-notices-desktop.png`, `task16b_real-payment-desktop.png`, `task16b_real-order-desktop.png`, `task16b_real-orders-desktop.png`.

### Comparison with eneba.com (1440 / 390): Eneba → ours → still different, why

Reference: headless Edge, `eneba.com/checkout` reached as a user does (product page → "Add to cart" → the header cart button), one and two items, 1440 and 390; computed styles in DESIGN.md 3.6 (S6). Nothing bought, no email entered; reference screenshots stay outside the repo.

| Eneba (measured) | Ours | Still different (why) |
|---|---|---|
| Own checkout header: logo + steps "Cart · Payment · Get your product", no nav, no footer | Our normal header, nav and footer | Intentionally not copied: our header carries sign-in and the demo banner; a step bar for two real steps adds little |
| Desktop: the header cart button opens a popup (lines, Total, "View cart", "Checkout now") | The cart icon goes to `/cart` | No popup: the task asks for a cart page; a second cart UI would duplicate it (open question 1) |
| Content 1010px centred: 635px "My cart" + 20px + 355px column; panels `#351183` | **Same** (`--checkout-max-width`, `--checkout-side-width`, `--color-bg-deep`) | — |
| "My cart" 18px/22px weight 800 | 18px bold (700) | Our font files have 700 as the heaviest weight (all pages) |
| Line `rgba(0,0,0,.12)`, 127px, padding `10 20 5 0`, 90×127 cover flush left, 20px to the text, 10px between lines | **Same** (`--color-surface-line`, `--cart-cover-width`) | A line grows when it shows a notice or an edition (Eneba has neither) |
| "Sold by" + seller logo + name, 12px bold white | "Sold by {seller}", 12px bold white | No seller logos (we have none) |
| "Digital product ⓘ" (12px, 70% white) | edition (if not Standard) and "platform · region" in 12px muted | Owner decision (edition, platform · region) |
| "- 1 +" 85×25, 16px semibold text signs | − 1 + with icon buttons (24px; 40px ≤600px), 16px number | Bigger tap targets (DESIGN 5.2); disabled state at the limits |
| Price = **unit** price, 14px bold | **line total** 14px bold, "€x each" under it when quantity > 1 | Owner decision ("line total") |
| Heart + trash icons top-right (70% white) | Trash only (muted, accent on hover) | No wishlist |
| "Cashback: €2.82" (lime) | — | No cashback feature |
| "Where to deliver the order?" + Email + "Remember me" | — | Keys go to the account (owner decisions of Task 14) |
| Summary: title 18px, yellow "Proceed to checkout" FIRST, then "2 products €35.73", "Service fee --", line, "Total:" 16px + 30px amount | **Same order**: "Checkout" (owner wording), "N products €x", line, "Total:" + 30px amount | No service fee; a muted "You will be asked to sign in first" when signed out |
| Consent checkboxes, discount code, Trustpilot, donation block, "Inspired by your picks" | — | Not features of this project / not copied |
| Phone: one column, everything edge to edge on `#351183`; lines padding `20 20 10`, 50×71 cover; Summary on `#2c0e6c` | **Same** edge to edge, padding `20 20 10`, 50px cover (`--cart-cover-width-sm`) | Summary stays `--color-bg-deep` with a 10px gap (one panel colour on all our checkout pages) |
| Payment step, order history, key page | Built from the same panels and lines (DESIGN 3.6, D) | Not reachable on Eneba without an email / a real purchase; the simulated payment box is ours by design |

## 3. What the owner must do manually

1. **Merge Task 16a (PR #17) first**, after its own pre-merge step (*Migrate production* from `task/16a-checkout-backend`). This PR has **no migration**.
2. **Tell Claude Code that 16a is merged.** It then: rebases this branch on `main` (the 16a frontend types and calls arrive in `src/api/` → this branch switches to 16a's names), repeats the real-API browser check against `main`'s `cmd/local`, pushes, opens the PR and waits for CI. (Not pushed before: a rebase of a pushed branch would need a force-push.)
3. On the Vercel **Preview** (dev branch): add two games → cart → Checkout → "Sign in as demo user" → back on the cart → Checkout → Decline (message) → Success → order page: Reveal and Copy a key → `/orders`.
4. Optional, to see the notices: in DevTools → Application → Local Storage → `cart:v1`, raise one `priceCents` by 100 and reload `/cart` → "Price updated: …".

## 4. Plain-language explanation

The cart lives in the browser and may be days old, so **every visit to the cart asks the server** what each line costs now and how many keys are left (`POST /api/checkout/quote`). The answer is written into the cart and the page says what changed next to the line: "Price updated: €10.99 → €12.49", "Only 2 left – quantity reduced", or "No longer available" (that line is greyed out, not counted, not sent to checkout; the user removes it).

**Checkout** first needs a signed-in user (otherwise the sign-in page, which comes back to the cart). It then asks the server to create the order and reserve the keys. Every attempt carries an **idempotency key**: the same key is reused for a double click or for pressing Checkout again after a network error, so the server answers with the order it already made instead of making a second one. A new key is made only when the cart is different. If the server says the cart changed (409), nothing was created: the new prices / quantities go into the cart with their notices, and the user presses Checkout again.

The **payment page** shows the order and "Reserved for mm:ss". The time is counted with the **server's** clock (the server sends its time with the order), so a wrong clock on the computer does not show the wrong time. The payment is **simulated**: a clearly labelled box with Success / Decline and no card fields at all – a demo that asks for card details teaches people a dangerous habit. Decline shows a message and the user can try again; when the time runs out the page says so and goes back to the cart (still full); Success removes the bought games from the cart and opens the order.

The **order page** shows what was bought (a snapshot taken when ordering). Keys are **hidden** on screen until "Reveal" (someone may be looking over the shoulder); "Copy" puts the real key on the clipboard and says "Copied". `/orders` lists all orders with their status; a pending one leads back to its payment page. Someone else's order is simply "Page not found" (the server answers 404 and does not reveal that it exists).

## 5. Deviations from the task and why

1. **Real API checked before the merge too.** The task says: mock until 16a is merged, the real API after the rebase. The mock run was done (49/49, incl. expiry), and because migration 00005 is already on the `dev` branch I also ran 16a's own `cmd/local` (built from the committed 16a branch into the scratchpad) – 22/22. It is repeated after the rebase (owner step 2).
2. **Not pushed / no PR yet.** The task orders "rebase on main after 16a is merged, then ask for review"; pushing now and rebasing later would need a force-push, which CLAUDE.md forbids. The worktree stays until the PR is opened.
3. **Type names – how the clash with 16a is resolved.** Both branches add the §4 types and calls to `src/api/types.ts` / `orders.ts` (16a §4 asks for them), with different names: `CheckoutItem`/`CartLineInput`, `QuoteLine`/`CheckoutLine`, `QuoteResponse`/`Quote`, `CartChangedResponse`/`CartChangedBody`, `getOrders`/`listOrders`; `keys?` optional here, `keys: string[]` in 16a. The JSON is identical (checked against `pkg/orders/types.go`, and the UI ran against 16a's server). **At the rebase 16a's versions win**: this UI switches to 16a's names; from this branch only what 16a lacks is added on top (`isHttpStatus`, `orderErrorMessage` and their tests), 16a's private `postJSON` is replaced by the shared `src/api/post.ts`, and `PAAISKINIMAI_LT.md` keeps both blocks (16a first).
4. **`postJSON` moved to `src/api/post.ts`** (was private in `auth.ts`). A first move into `client.ts` broke 14 auth tests: their `vi.mock` replaces the exported `apiFetch`, but a helper inside `client.ts` calls the module's own copy. A separate module fixes that.
5. **"Pay" / "Checkout" "disabled while the request runs"** is the Button's `loading` state (spinner, `aria-busy`, clicks ignored, keeps keyboard focus – DESIGN 4 "Loading"), not the `disabled` attribute; plus a guard in the click handler. Tested: a second click sends no second request.
6. **Task 14 tests changed:** they used `/orders` as the "protected page" and read its placeholder text ("Signed in as …"). The fakes now answer `GET /api/orders` with `[]` and the assertions check the orders page.
7. **Additions not in the task (justified extras):** `src/api/post.ts` (item 4); cached orders are dropped on sign in / sign out (another user in the same tab must never see them); the notices of a line are cleared when the user changes its quantity (they have answered it); "Could not check the latest prices and stock. Try again" when the quote fails (the cart and Checkout still work: the server checks again).

## 6. Open questions

1. Eneba's desktop cart button opens a **popup** (lines, total, "View cart", "Checkout now"). Should we add one, or is the cart page enough?
2. **Back from the payment page and Checkout again** with the same cart creates a **second** pending order (the key is forgotten once an order exists, as the task says), and the first order's keys stay reserved until it expires (15 min, lazy expiry) unless the user presses "Cancel order". Alternative: remember the pending order per cart and open it again. Keep as is?
3. "Cancel order" has no "Are you sure?" step (nothing is lost: the cart stays). Fine?

## 7. Self-review (task-reviewer)

The `task-reviewer` subagent was given only the task number and the worktree path. **Verdict: CHANGES NEEDED** – all 21 requirements "done" except §3 Verify "partly" (the report and its comparison table did not exist yet; the real-API claim cannot be seen in the repo); **no CLAUDE.md violations** (raw `fetch`, hardcoded values, cents, lint disables, secrets, tokens documented, no Go / migration changes all checked).

| Finding | What was done |
|---|---|
| No unit tests for the error readers in `src/api/orders.ts` (`orderErrorMessage`, `cartChangedLines`, `isReservationExpired`): nothing checks that a 5xx gives the generic sentence, not the server text | **Fixed:** `src/api/orders.test.ts` (7 tests: 400/402/409 show the server text; 500/503/404/no text/plain `Error` → generic; network/timeout → "check your connection"; `cart_changed` only with lines; "Reservation expired" only as 409) |
| `.changed:empty { display: none }` hides the `role="status"` element while empty; a hidden live region may not announce text added later | **Fixed:** the empty paragraph stays rendered (no `display: none`), only its margin is removed, so it takes no space |
| The `src/api/types.ts` / `orders.ts` clash with 16a is certain; say which names win | **Answered** in §5 item 3: 16a's versions win at the rebase, this UI adopts its names |
| `post.ts` and `dropOrders` are outside the task's wording | Kept and listed as justified extras (§5 items 4 and 7); both are explained in `PAAISKINIMAI_LT.md` |
| How the "real API" screenshots were made is not visible in the repo | §2: `cmd/local` built from the committed `origin/task/16a-checkout-backend` into the scratchpad (`git archive`, nothing written to the repo), run on 127.0.0.1:8097 against Neon `dev`, where 16a had already applied migration 00005 |
| A second checkout of the same cart after a `201` makes a second pending order | Open question 2 (§6) |
| `fixtures.ts` / `testApp.tsx` are test helpers in non-test files | Kept (not imported by app code, not bundled; same as the existing `features/product/fixtures.ts`); noted in §1 |
| The report must be named `TASK_16b_checkout_ui.md` (DESIGN.md links to it); the session log is not exported yet | This file has that name; the session log is committed at the end of the session |

After the fixes: lint 0, **530/530** tests, build OK.
