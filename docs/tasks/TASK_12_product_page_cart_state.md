# Task 12 – Product page (Eneba parity) + cart state

**Model:** Opus · **Effort:** high
Start after Task 11b is merged.

## Goal
1. The real `/product/:slug` page on top of `GET /api/products/{slug}` (Task 09), built **side by side with a real eneba.com product page** (CLAUDE.md UI rule).
2. The **cart state** (browser-side), so every "Add to cart" button works from day one. The cart page itself is the next task.

## Decisions (made by the owner – do not change)
**Product page – what must be on it** (layout and look come from eneba.com, not from this list):
- P1. Cover, title, edition (if not "Standard"), platform + region; a **buy box with the cheapest buyable offer** (price, MSRP struck through, "-NN%", seller name + rating label, "Add to cart").
- P2. **All buyable offers** (API already hides stock-0 offers): seller, rating ("Excellent 9.63" or "New seller"), reviews count, price, "Add to cart". The cheapest is marked "Best price". Show "Only N left" when stock ≤ 3.
- P3. **Other versions** of the same game (`variants`): platform / region / edition with price or "Out of stock", linking to their pages.
- P4. Description, genres, release date, developer, publisher. Breadcrumb "Store › {title}".
- P5. Phones: a **sticky bottom bar** with the cheapest price + "Add to cart" (if Eneba has an equivalent, follow its look).
- P6. Out-of-stock product: an "Out of stock" box instead of the buy box + links to in-stock variants. Unknown slug: the 404 page inside the layout. API errors: `ErrorState` with Retry. Loading: skeleton (the hover prefetch from Task 11 usually makes it instant).
- Page title "{title} – EneHomeworkBa". Uses the shared `productQuery` from `src/api/queries.ts`.
- No dead UI (wishlist, cashback, "Buy now" without checkout, reviews section, system requirements … are not built – list them under "intentionally not copied").

**Cart state**
- C1. A cart line = **one offer** (`offerId`). The same product from another seller = another line.
- C2. Quantity 1 … **min(stock, 5)**. Adding an offer that is already in the cart increases its quantity up to that limit (then a message "Maximum quantity reached").
- C3. Stored in **localStorage** (versioned key, e.g. `cart:v1`), only: `offerId`, `quantity`, and display data captured when added (`productSlug`, `title`, `edition`, `platformName`, `regionName`, `coverUrl`, `sellerName`, `priceCents`, `stock`). Corrupt/old data → start with an empty cart, never crash. **The checkout will re-validate price and stock on the server** – the stored price is display only.
- C4. After adding: a **toast** "Added to cart" with a "View cart" link (DESIGN.md toast); the header cart badge updates (replace the `useCartCount` stub). The cart syncs **across browser tabs** (`storage` event).
- Implementation: a small external store (e.g. `useSyncExternalStore`) or a React context – choose, explain. Pure functions for add / setQuantity / remove / clear / count / total with Vitest tests. No new dependency.
- Store cards: Eneba shows a cart button on cards; **now that the cart exists**, add it if eneba.com has it (desktop hover "Add to cart" next to "View offers", phone cart icon button) – it adds the **cheapest offer**. Not on out-of-stock cards. Since the listing API has no offerId, either extend `GET /api/products` items with `cheapestOfferId` (+ its stock and seller name) – small Go change with tests – or leave the card button out and say why. Owner preference: add it.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/12-product-page`).

## 2. Reference
Capture an eneba.com product page (a game with several sellers) at 1440 × 900 and 390 × 844 – buy box, offers list, other versions, description area, phone sticky bar. Reference screenshots stay **outside the repo**; describe them in the report. Compare, fix, re-capture.

## 3. Tests
- Cart pure functions (limits, merge, corrupt storage, versioning), tab sync.
- Product page with mocked `apiFetch`: buy box shows the cheapest offer; "Best price" and "Only N left"; New seller; out-of-stock product; 404; variants link; add to cart updates the badge and shows the toast.
- If the Go listing API is extended: handler + integration tests (cheapest offer id matches the product page's first offer).

## 4. Verify
Standard checks + real browser against the local API (`dev`): screenshots of a multi-seller product, an out-of-stock product, a product with a New seller, phone sticky bar, toast; axe 0 violations; CLS < 0.1; tab sync (two tabs); side-by-side comparison table vs eneba.com.

## 5. Docs
`docs/PAAISKINIMAI_LT.md`: cart store design and why localStorage + server re-validation; `useSyncExternalStore` (or context) choice; tab sync; quantity limits; why the stored price is display only; the product page data flow (prefetch → cache → page).

## Report
As defined in `CLAUDE.md` (incl. comparison table, "intentionally not copied", Self-review). Export the session log at the end and commit it on this branch.
