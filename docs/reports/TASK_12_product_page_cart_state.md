# Task 12 – Product page (Eneba parity) + cart state: report

Task file: [`docs/tasks/TASK_12_product_page_cart_state.md`](../tasks/TASK_12_product_page_cart_state.md) · Branch: `task/12-product-page`

## 1. Files changed

**Go (listing API: `cheapestOffer`)**
- `pkg/catalog/types.go`: `Item.CheapestOffer *CheapestOffer` (`offerId`, `stock`, `sellerName`; `null` = out of stock).
- `pkg/catalog/store.go`: `itemsSQL` picks the page in a CTE (`row_number() … AS pos` keeps the order), then `LEFT JOIN LATERAL` the cheapest buyable offer **only for those rows**. It uses the same stock rule (`offerStock`, now shared with `offersSQL`) and the same order (`price, id`) as the product page.
- Tests: `pkg/server/catalog_handlers_test.go` (JSON shape, `null` when out of stock), `pkg/catalog/store_integration_test.go` (`TestListProducts_cheapestOfferMatchesProductPage`: all 108 products).
- `README.md`: API docs for `cheapestOffer`.

**Cart state**
- `src/features/cart/cart.ts` (+ `cart.test.ts`): pure rules (add / setQuantity / remove / count / total, the `min(stock, 5)` limit, `parseCart` / `serializeCart`, building a line from an offer or a card).
- `src/features/cart/cartStore.ts` (+ `cartStore.test.ts`): external store, `localStorage` key `cart:v1`, tab sync through the `storage` event.
- `src/features/cart/useCart.ts`, `src/features/cart/addToCart.ts`; `src/lib/useCartCount.ts` (the stub replaced, same name and type).
- Toasts: `src/lib/toast.ts`, `src/app/Toaster.tsx` / `.module.css` / `.test.tsx`. `src/app/Layout.tsx` / `.module.css`: a bottom-corner `.notices` column shared with the "waking up" notice (`SlowServerNotice.module.css` lost its own fixed position), and the wide-page rule `.main:has([data-wide-page])`.

**Product page**
- `src/pages/ProductPage.tsx` / `.module.css` / `.test.tsx`.
- `src/features/product/`: `ProductView.tsx` / `.module.css` (grid, facts, skeleton), `BuyBox.tsx` (buy box + `OutOfStockBox`) / `.module.css`, `OfferList.tsx` / `.module.css`, `VariantList.tsx` / `.module.css`, `ProductDetails.tsx` / `.module.css`, `sellerText.ts` (+ test), `variantName.ts`, `fixtures.ts`.
- Shared pieces: `src/components/Breadcrumb.tsx` / `.module.css`, `src/components/Price.tsx` / `.module.css` (new `row` size, 22px buy-box price on phones), `src/lib/discount.ts`, `src/lib/formatDate.ts` (each helper has a test).
- After the owner's review: the phone sticky bar was **removed** (`StickyBuyBar.tsx` / `.module.css`, `src/lib/useInView.ts`, the `--sticky-bar-height` token, the `data-bottom-bar` toast offset, its test and screenshot). See §5.
- `src/api/types.ts` (`CheapestOffer`), `src/styles/tokens.css` (new tokens, see DESIGN.md 2).

**Store card**
- `src/features/store/ProductCard.tsx` / `.module.css` / `.test.tsx`, `src/features/store/fixtures.ts`.

**Docs**
- `docs/DESIGN.md`: S5 source, tokens, 3.3 / 4.3 / 4.4 / 4.7 / 4.11 "as built", 5.1 contrast rows, 6 research notes.
- `docs/PAAISKINIMAI_LT.md`: Task 12 block.
- `docs/reports/assets/task12_*.png`: our screenshots.

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...`, `go test ./...` | pass. `go.mod` still `go 1.25.0`, no new module |
| Go integration tests | Need `TEST_DATABASE_URL`, so they ran on CI only (no local Postgres; never Neon). The **same comparison was run against the `dev` branch through the local API** (read-only script, all 108 products): 97 with `cheapestOffer` (11 out of stock, as seeded), **0 mismatches** with the product page's first offer (id, stock, seller, price), `price_asc` order intact |
| `npm run lint` | 0 problems |
| `npm test` (PowerShell) | **27 files, 312 tests passed** (313 before the phone bar and its test were removed). New: cart rules 29, cart store 12 (incl. tab sync), toaster 5, product page 18, card button 3, helpers 7 |
| `npm run build` | pass |
| **axe-core** (WCAG 2 A/AA, 2.1 AA, best practice), headless Edge, production build | **0 violations** on 12 states: multi-seller product, + toast, phone bar shown (bar since removed), out of stock, 404, Store (desktop and phone each). The first run found one: the struck-through price in the buy box (`#b3aac9` on the panel, 3.73:1). Fixed with `--color-text-muted` (4.79:1, also Eneba's colour there) |
| **CLS** (production build, layout-shift observer) | Product / out of stock / unknown slug: **≤ 0.0001** desktop, 0.0000 phone. Store → product by card click (hover-prefetched): 0.0000, and no skeleton is seen at all. Before fixing: 0.046 (the footer was pushed down when data replaced a short skeleton) and 0.056 (`<main>` narrowed from 1440 to 1240 when the 404 replaced the skeleton). Fix: the route wrapper is one screen tall and always wide |
| Horizontal overflow | none at 360 / 390 / 600 / 601 / 768 / 930 / 931 / 1024 / 1200 / 1440 on the product page, the out-of-stock page and the Store |
| Tab sync (2 tabs, same browser) | 2 adds in tab A → both tabs show "Cart, 2 items". Tab B empties the stored cart → tab A shows "Cart, 0 items" |
| Keyboard (Store) | Tab from a card link goes to "Add to cart: Grand Theft Auto V". The card slides up on keyboard focus; Enter adds the item and shows the toast |

**Screenshots (ours, production build against `dev`):** `docs/reports/assets/`:
- multi-seller product with a New seller: `task12_product-desktop.png`, `-desktop-full.png`, `-mobile.png`, `-tablet.png`
- out of stock: `task12_oos-desktop.png`, `-mobile.png`
- toast: `task12_toast-desktop.png`, `-mobile.png`
- Store card button: `task12_store-desktop.png` (hovered card), `task12_store-mobile.png` (cart icon)

**How the reference was captured.** Same headless-Edge setup as Task 11b (`puppeteer-core` + `axe-core` in the session scratchpad, nothing added to the repo). It ran at 1440×900 and 390×844 on two multi-seller pages: `/steam-silent-hill-2-pc-steam-key-global` (20 offers) and `/gog-the-witcher-3-wild-hunt-gog-com-key-global` (8 offers). The script took screenshots, read the computed styles and rectangles of the page parts, and scrolled the phone page looking for a sticky bar. Cookie and location pop-ups were removed from the DOM (no consent given). **Reference screenshots stay outside the repo.**

What the reference shows:
- **Desktop:** breadcrumb, then a 224px cover. Next to it a "Cashback deal" pill, the 26px title, a 2×2 facts grid (region, platform, digital key, refunds) and "Works on". Under them a screenshot strip, then "Recommended offers" and "19 other offers" (rows) with "Load 16 more offers". Then "Gamers also viewed", Reviews, "Product Details" (genre tags + Description / Activation guide tabs), System requirements and "Other details". On the right a 350px "FEATURED OFFER" box: old price, price, cashback, PayPal, "Buy now" + cart icon, "+19 offers from €18.70". Below it Trustpilot and payment-method panels.
- **Phone:** no breadcrumb. A 72×96 cover next to a 16px title, then the box edge to edge, then the facts, then the rows edge to edge. **No sticky bottom bar**, only the sticky header.

### Comparison (desktop 1440 / phone 390): difference found → changed → still different, why

**Layout and header area**

| Eneba (measured) | Ours | Still different (why) |
|---|---|---|
| Content 40…1400px, header stays at 1200px | `<main>` widened to 1440 / 40px gutters on the product route | – |
| Breadcrumb 14px, 70% white, chevrons; hidden on phones | same; "Store › {title}" (P4) | Eneba has more crumbs (categories) and a home icon: we have no category pages |
| Cover 224×299, 30px to the title column | 224×304 (`--cover-aspect-ratio` from Task 11b) | 5px taller (the shared cover ratio) |
| h1 26px bold (16px on phones, 72px cover beside it) | same, measured x/y identical on the phone | Title is the game name; Eneba's h1 is an SEO string ("… Steam Key (PC) GLOBAL"), our platform/region are in the facts |
| "Cashback deal" pill above the h1 | edition pill (`Badge` tag) in that place, only for non-Standard editions (P1) | no cashback |
| Facts 2×2: icon, 16px bold heading, 12px 60% helper | region, platform, "Digital key"; helper 70% white | No "Instant refunds" fact and no "Works on" (no such data or feature); 70% instead of 60% for contrast; generic Lucide icons instead of Eneba's / platform logos |

**Buy box**

| Eneba (measured) | Ours | Still different (why) |
|---|---|---|
| 350px, `#5825cc`, padding 20 20 15, shadow `0 3px 9px rgba(0,0,0,.25)`; edge to edge on phones | same (`--buy-box-width`, `--shadow-card`) | Top-aligned with the cover (Eneba has a Trustpilot line above it) |
| "FEATURED OFFER" 10px bold uppercase yellow, 20px gap | "BEST PRICE", same style | Wording: ours is always the cheapest offer (P1) |
| Old price 12px 70% white + "-NN%"; price 28px (21.5px phone) | same; 22px on phones | No ⓘ, "Price is not final", cashback or promotion line |
| PayPal + "Buy now" (primary) + cart icon button | one full-width primary "Add to cart"; "Sold by {seller} ★ rating" line (P1) | No checkout yet: "Buy now" and PayPal would be dead UI |
| "+19 offers from €18.70" (yellow, under a divider) | "+3 more offers", jumps to the offer list | Eneba's featured offer is not always the cheapest, ours is, so "from €x" would repeat the box price |
| Panels under the box (payment methods, Scamadviser, newsletter) | – | not our content / no such features |

**Offers**

| Eneba (measured) | Ours | Still different (why) |
|---|---|---|
| "Recommended offers" + "19 other offers" (count in mint), h2 18px | one section "4 offers" (count in mint), h2 18px | All offers in one list (P2); no "recommended" logic |
| Row `rgba(0,0,0,.3)`, padding 20, 8px apart; 40px logo; name 14px; "★ 9.72 Excellent rating" 11px | same background and padding, 10px apart; letter avatar; "★ Excellent 9.63 (9,875 reviews)" 12px, "NEW SELLER" (P2) | 10px gap (nearest token); no seller logos (we have none); 12px text (our 12px minimum, DESIGN 5.2); the reviews count is ours (P2) |
| Price 20px (17.8px phone), old price + discount above | same; per-offer "-NN%" from integer cents (server rule) | No cashback line |
| Outlined "Buy now"; phone: PayPal + cart icon + "Buy now" | outlined "Add to cart" with a cart icon; full width on phones | No checkout (dead UI) |
| "Best cashback" outlined green pill | "BEST PRICE" in the same pill style on the cheapest offer (P2); "Only N left" in amber (P2) | – |
| "Load 16 more offers" | all offers shown | Our products have at most ~5 offers |

**Other versions (P3)**: Eneba has no such block on the product page. Ours reuses the row look (each row is one link with a hover colour) and prefetches on hover like a card.

**Details**

| Eneba (measured) | Ours | Still different (why) |
|---|---|---|
| "Product Details": genre tags (14px, `rgba(0,0,0,.3)`, radius 10, subtle text) | same (`--radius-lg`) | Tags are text, not links (no genre pages) |
| Tabs "Description / Activation guide" (50px, `#351183`), panel `#351183` padding 20, 14/21 `#dcd8e6`, "Read more" | a static heading drawn like the active tab, same panel | One "tab" only (no activation guides); no "Read more" (IGDB summaries are short) |
| "Other details": a table, label 14px `#b3aac9`, 20px gap; stacked on phones | `<dl>` grid, same colours, stacked on phones; rows: release date, developer, publisher, platform, region, edition | No languages / "Works on" (no data) |

**Phone bar (P5)**: Eneba has none (checked by scrolling at 390px). It was built, then **removed after the owner's review** (parity wins), so ours has none either.

**Toast (C4)**: Eneba has no add-to-cart toast we could see (adding needs a session). Ours follows DESIGN 4.11.

**Store card**

| Eneba (DESIGN 4.3 / Task 11b) | Ours | Still different (why) |
|---|---|---|
| Hover: yellow "Add to cart" + outlined "View offers", card slides up ~95px | same: 35 + 10 + 35 + 15px | – |
| Phone list card: cart icon button bottom-right, 50px kept free | 40×40 outlined cart icon, 50px kept free | No wishlist heart |

### Intentionally not copied
- Eneba's logo, seller logos, platform logos and icons as files, the screenshot / trailer strip, and all Eneba text content (SEO title, long descriptions, FAQ).
- Features we do not have:
  - "Buy now", PayPal and "Price is not final" ⓘ (no checkout)
  - the wishlist heart and its counter, cashback (pill, line, "Best cashback"), "Promotion ends in …", "N people watching"
  - "Recommended offers" logic, "Verified by Eneba", "Load more offers"
  - "Instant refunds" fact, "Works on" / "Check requirements", system requirements, languages
  - Activation guide tab, "Read more"
  - reviews section and "Review now", "Gamers also viewed"
  - Trustpilot, payment-method, Scamadviser and "Editor's Choice" panels, the newsletter box
  - category crumbs and genre links

## 3. What the owner must do manually
1. Open the PR Preview and compare with eneba.com at laptop size and on your phone. On a product page: buy box, offers, "Other versions" and the toast. Then open an out-of-stock product, e.g. `/product/hades-psn-global`.
2. Add items, then open a second tab. The header badge follows in both tabs. Reload: the cart is still there.
3. In the Store, hover a card ("Add to cart" + "View offers") and tap the cart icon on a phone.
4. Export the session log (`/export`) and save it as `ai-logs/2026-11-22_NN_product-page-cart.md`; Claude Code commits it on this branch if you ask (CLAUDE.md). This was a local session, so the remote-conversion procedure was not used.
5. Note: during the browser check your older `cmd/local` (:8080) and Vite (:5173) from 2026-11-21 were still running. I left them alone and used :8081 / :4174 instead.

## 4. Plain-language explanation
- **Product page.** Clicking a game now opens a real product page, laid out like Eneba's after measuring it with a script.
  - The cover, title and facts sit on the left, and a box on the right shows the cheapest offer with "Add to cart".
  - Below them come every seller's offer (the cheapest marked "Best price", low stock marked "Only 2 left", new sellers marked as such), the other versions of the same game, and the details.
  - On phones everything is one column, like Eneba. There is no extra "Add to cart" bar at the bottom: Eneba has none, so the one built for P5 was removed after review.
  - An out-of-stock product shows where else the game can be bought. An unknown address shows the 404 page.
- **Cart.** It now exists in the browser.
  - Every "Add to cart" (product page, offer rows, Store cards) adds one offer, up to 5 and never more than the seller has.
  - A short message confirms it, the header count goes up, and other open tabs see the change too.
  - The cart is kept in `localStorage`. The saved price is only for display: the checkout will check price and stock on the server again.
- **Store cards.** They can add to the cart directly. The listing API now also says which offer is the cheapest for each product, the same offer the product page shows first.

## 5. Deviations from the task and why
- **`cheapestOffer` is one nested object** (`{offerId, stock, sellerName} | null`) instead of three separate fields. The three values are all present or all missing together, so one nullable object says that in the type, and the frontend checks one thing.
- **No phone sticky bar (P5 dropped):** P5 asked for one "if Eneba has an equivalent, follow its look". Eneba has none. The bar was built first; in review the owner decided parity wins, so it was removed with its helper (`useInView`), token, test and screenshot.
- **Buy box label "Best price"** instead of Eneba's "Featured offer", because ours is always the cheapest offer (P1).
- **Values without a matching token:** row gap 10px (Eneba 8px) and toast slide 10px (DESIGN said 8px). The nearest token is used rather than a one-off value.
- **Breadcrumb:** "Store › {title}" (P4) is hidden on phones, as on Eneba.
- **Not built:** an error toast type (nothing uses it yet) and "Read more" on descriptions (IGDB summaries are short).
- **Not unit-tested directly:** `Breadcrumb` (see §7).
- **Infrastructure changes outside the product page**, needed by it:
  - the toast and "waking up" notice share one positioned column (otherwise they would overlap);
  - `<main>` widens through `:has([data-wide-page])` instead of each page doing its own layout.

## 6. Open questions
None open. The owner answered the review questions:
1. Eneba has no "other versions" list and no phone sticky bar. → **Remove the phone bar** (parity wins; done), **keep "Other versions"**.
2. Cart badge = number of pieces (2 × one offer = "2"), not the number of lines. → **Keep.**
3. The card "Add to cart" uses Eneba's yellow primary button inside every card on hover (DESIGN 4.1 says "primary once per view area"). → **Keep, like Eneba.**

## 7. Self-review (task-reviewer)
The `task-reviewer` subagent got only the task number. It ran after the code and docs were committed and before this report existed.

**Verdict: PASS.** Every requirement (P1–P6, title / productQuery, no dead UI, C1–C4, implementation choice, card button with the Go extension, tests, LT docs) is "done". The rows still open at that point were "Verify" (the report did not exist yet) and "Report / session log" (missing, as expected). **Scope creep:** none clearly; it listed items to justify (notices column, `Price` row size, new helpers, README, new tokens). **CLAUDE.md violations:** none.

| Finding | What was done |
|---|---|
| The report must hold the comparison table, "intentionally not copied", the phone bar and other-versions as our decisions, and the token-gap deviations | Done: §2 and §5 |
| Verification claims (axe 0 after the contrast fix, CLS 0.0001) must be repeated with real results | §2 has the numbers, including the failures found first and how they were fixed |
| Scope items to justify: notices column, `Price` row size, `formatDate` / `discount` helpers, README, new tokens | §1 and §5: the notices column prevents overlap; the row size is a measured Eneba value; the helpers are needed by P1 / P4 and have tests; the README documents the API change; tokens are in DESIGN.md 2 |
| `useInView` and `Breadcrumb` have no direct unit test | Not added. `useInView` was later removed together with the phone bar. `Breadcrumb` is covered by the product page test (link + `aria-current`) |
| `.vscode/` is untracked; keep it out of the PR | Not committed |
| Session log not committed | Owner step (§3, item 4) |
