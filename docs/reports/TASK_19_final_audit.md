# Task 19 – Final audit against the assignment + last fixes – Report

Branch `task/19-final-audit` · task file [`docs/tasks/TASK_19_final_audit.md`](../tasks/TASK_19_final_audit.md) · 2026-11-24 · no migration, no seed, no Go change, no new dependency.

## 1. Files changed

| File | Change |
|---|---|
| `docs/tasks/TASK_19_final_audit.md` | the task file, verbatim (first commit) |
| `src/app/Header.tsx` | signed out, desktop: **"Sign in \| Register"** (known fix 1); both links keep `?next=`; the `\|` is `aria-hidden` |
| `src/app/Header.module.css` | `.signIn`, `.authDivider`, `.register` (tight spacing around the `\|`, tokens only); ≤930px the divider and Register are hidden |
| `src/app/AccountMenu.test.tsx` | tests: both links with `next` (also with a query string), no `next` on the home page, divider hidden from screen readers, both gone when signed in, back after sign-out |
| `src/components/TextField.module.css` | `.input::-ms-reveal { display: none }` – Edge drew a second "show password" eye (found in the production sign-in check, §2.2) |
| `docs/DESIGN.md` | §3.1 "As built in Task 19" (header account links, Edge reveal button) |
| `docs/PAAISKINIMAI_LT.md` | new section "Task 19 – galutinis auditas" (both changes) |
| `README.md` | the earlier stack/hosting conversation (known fix 2); planning-chat link (known fix 3); counts: 25 tasks, 22 PRs, 254 commits, 23 logs, 628 frontend tests |
| `docs/reports/TASK_19_final_audit.md` | this report |
| `ai-logs/2026-11-24_01_final-audit.md` | this session's log (converted from the transcript, redacted) |

## 2. Verification results

### 2.1 Standard checks

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...` | ok |
| `go test ./...` | all packages ok (DB integration tests skip locally; no Go code changed) |
| `npm run lint` | 0 problems |
| `npm test` (PowerShell) | **50 files, 628 tests pass** (625 before; +3 new header tests, one existing test extended) |
| New tests before the code (TDD) | 5 of 13 in `AccountMenu.test.tsx` failed for the expected reason ("expected undefined to be '/register?next=%2Fcart'"), all pass after the change |
| `npm run build` | passes (main JS 451.05 kB / gzip 144.12 kB) |
| GitHub CI | see §2.8 |

### 2.2 Sign-in sanity check on production (known fix 4)

**Nothing failed.** Production <https://enehomeworkba.vercel.app>, 2026-11-24, fresh throw-away addresses `t19-…@example.com`.

**API** (curl, `Origin` = the site, cookie jar):

| Step | Answer |
|---|---|
| `POST /api/auth/register` (fresh e-mail and password) | `201 {"user":{…,"isDemo":false}}` + cookie |
| `GET /api/auth/me` | `200` |
| `POST /api/auth/logout` | `204` |
| `GET /api/auth/me` | `401` (signed out) |
| `POST /api/auth/login` (same e-mail + password) | `200 {"user":…}` |
| `GET /api/auth/me` → `POST /api/auth/logout` | `200` → `204` |
| login, wrong password | `401 {"error":"Invalid email or password"}` |
| login, unknown e-mail | `401 {"error":"Invalid email or password"}` (same text) |
| login with the e-mail in UPPER CASE / with spaces around it | `200` / `200` |

**Real UI** (headless Edge, script in the session scratchpad), desktop 1440 × 900 and phone 390 × 844 touch, a new browser context and a new e-mail for each:

| Step | Desktop | Phone |
|---|---|---|
| `/store` → header "Sign in" → "Create an account" (phone: ☰ → "Create account") → `/register?next=%2Fstore` | pass | pass |
| Create account → back on `/store`, account menu shows the e-mail | pass | pass |
| Sign out (account menu / ☰ → Sign out) | pass | pass |
| Sign in with the same e-mail + password | pass | pass |
| Sign out | pass | pass |
| Wrong password → `role="alert"` **"Invalid email or password"**, still on `/login` | pass | pass |
| Requests ≥ 400 | only `401 GET /api/auth/me` while signed out and the `401 POST /api/auth/login` of the wrong password | same |

**Found on the way:** in Edge the password field showed **two eye icons**, Edge's own `::-ms-reveal` button next to our show/hide button (screenshot of `/register` on the phone). It does not stop sign-in, but it is confusing; fixed (`TextField.module.css`), re-checked: one eye at both sizes. What might have caused the owner's trouble is in §6, Q6.

The same script on the local stack with this branch (desktop path through the **new header "Register" link**): 12/12 pass.

### 2.3 Smoke tests (desktop 1440 × 900 and phone 390 × 844 touch, headless Edge)

The Vercel Preview of this branch is behind **Vercel Authentication** (every request, `/api/health` too, answers `302` to the Vercel login), as in Task 09; I did not try to get around it. So the changed code ran as **the production build on a local stack**: `vite preview` (127.0.0.1:4173) → `cmd/local` (127.0.0.1:8080) → Neon `dev`. Production was tested as it is now (`main`).

| Step | Local stack, this branch: desktop / phone | Production (`main`): desktop / phone |
|---|---|---|
| Home: hero + blocks (INNERT, Witcher 3 slides; Popular right now, Biggest discounts, New releases) | pass / pass | pass / pass (+ the GTA V slide) |
| **Header (new):** desktop "Sign in \| Register" with `/login`, `/register`; phone: icon only, ☰ → "Sign in" + "Create account" with `/register` | **pass / pass** | **FAIL (expected: not merged yet)** / pass |
| Search suggestions `witchr 3` → The Witcher 3, `gta` → Grand Theft Auto V "Also known as GTA 5" | pass / pass | pass / pass |
| Enter → `/store?q=gta`, "Results for 'gta'", 16 product links | pass / pass | pass / pass |
| Store filter Steam → `?platform=steam`, "54 results" (phone through the drawer) | pass / pass | pass / pass |
| Product → Add to cart → "Cart, 1 item" | pass (Max Payne) / pass (Half-Life 2) | pass (Mass Effect 2 US) / pass (Half-Life) |
| Demo sign-in from `/login?next=/cart` → back on `/cart` | pass / pass | pass / pass |
| Checkout → **Decline** → "Payment declined (simulated)…" | pass / pass | pass / pass |
| **Success** → `/orders/<id>`, key masked `DEMO-••••-••••-••••`, Reveal → `DEMO-XXXX-XXXX-XXXX` | pass / pass | pass / pass |
| `/orders` lists it as Paid | pass / pass | pass / pass |
| Demo banner on home, search, store, product, login, cart, payment, order, orders, 404 | pass / pass | pass / pass |
| Unexpected failed requests / console errors | none / none (only `401 /api/auth/me` signed out, `402` decline, 404 page) | none / none |
| **Total** | **26/26** | **25/26** (the one fail is the header change that is not on `main` yet) |

The header check on production should pass after the merge (§3).

**What the checks left behind.** Production: my 3 registered `t19-…@example.com` accounts, 2 demo users and **2 fake keys sold** (Mass Effect 2, Half-Life); the audit subagent's 1 registered `audit-…@example.com` account, 3 demo users and 2 fake keys sold (Elden Ring ×2). Neon `dev`: 2 registered accounts, 2 demo users, 2 keys (Max Payne, Half-Life 2).

### 2.4 Accessibility (axe-core 4.14.1, WCAG 2.0/2.1 A + AA + best practice, reduced motion)

On the production build of this branch (local stack), at 1440 and 390 px: `/`, `/store`, `/store?q=witcher`, a product, `/cart`, `/login`, `/register`, a 404. These are the changed pages: the header is on every page and the password field is on `/login` and `/register`. **0 violations in 16 runs.**

### 2.5 Comparison with eneba.com (1440 px and 390 px)

| | eneba.com | ours (this branch) |
|---|---|---|
| Desktop header, signed out | user icon · "Log in \| Register", the text ends at x ≈ 1310 | user icon · "Sign in \| Register", the text ends at x = 1310 |
| Phone header (390) | ☰ · logo · search · ♡ · cart · **account icon only** | ☰ · wordmark · search · cart · **account icon only**; "Create account" in ☰ |

Still different, on purpose: "Sign in" instead of "Log in" (the owner's wording; our pages are titled "Sign in"). Eneba's text is 15 px extra-bold, ours stays 14 px medium, the size our "Sign in" link has had since Task 11b. No locale switch and no ♡ (we have no such features). Eneba's logo is not copied.

Product page width, measured live for the audit's finding 1 (§2.7): on an eneba.com product page at 1440 px the title starts at **x = 294**, the cover and breadcrumb at x = 40, the buy box ends at 1400, and the header starts at 120. Ours is the same: title **x = 294**, header 120.

### 2.6 Fresh-eyes audit (§2 of the task)

**How it was run.** It ran before any fix. A separate `general-purpose` subagent got only: the assignment text (verbatim), the repository (read-only) and the production URL. It also got the headless-Edge tooling and the rules for using production gently (≤ 3 accounts with `@example.com` addresses, ≤ 4 fake purchases, no load or brute force). It was told to judge only the live site and the code. It was also told **not** to use `CLAUDE.md`, `docs/tasks/`, `docs/reports/`, `ai-logs/` or `docs/PAAISKINIMAI_LT.md` as justification. It was allowed to read `ai-logs/` and the README only to judge the first three bullets, and to treat README claims as claims to verify. It was not given our context, the reports or our decisions. These files are in the repository it read, though, so ignoring them was its instruction, not a technical guarantee. It ran ~9 minutes, 52 tool calls.

Its output follows **verbatim** between the two lines. Its own headings are kept as they were.

---

## Audit of https://enehomeworkba.vercel.app (repo c:\PROJEKTAI\ENEBA\ENEBA-homework)

**Method.** I used headless Edge at 1440x900 and 390x844 (isMobile, hasTouch). I walked home, header search, typo search, product, cart, sign-in gate, register, sign-in, payment decline, payment success, key reveal and order history, on both sizes. I used 1 registered account (`audit-…@example.com`) plus 2 demo-sign-in accounts for exploring (plus 1 more demo account for the API probes). I made 2 purchases (Elden Ring, one per viewport; each had one Decline first). I also ran axe-core, checked keyboard tab order, and probed the API with curl. eneba.com loaded in headless Edge without being blocked, so I compared it with screenshots on both sizes (home, /store/all). I did not capture Eneba's product page, cart or checkout, so the comparison for those screens rests on the home and store pages only. I could not click through the desktop account menu / sign-out (my script failed on that click). I checked sign-out only indirectly: the `/api/auth/logout` route exists, and I did not test it.

### 1. Requirement table

| # | Requirement (sentence) | Verdict | Evidence | What a reviewer would criticise |
|---|---|---|---|---|
| 1 | AI and agentic coding is strongly encouraged. Ask your agent to save a log of your conversations (full) which are required to submit. | partly | `ai-logs/` has 22 session files (62–408 KB each). Header of `ai-logs/2026-11-23_06_homepage.md`: "tool calls with shortened inputs and outputs. Claude's internal thinking and the harness's system-reminder blocks are omitted… Attached task files are shortened". | The logs are not "full": they are a lossy, redacted conversion of the transcript. Thinking is dropped and tool I/O is truncated. README line 223 says logs are "converted from the session transcripts", not exported. The README also says 21 files but there are 22. |
| 2 | In case you use a non-agentic approach, please provide a link to the conversation. | partly | `README.md:223`: "The planning chat: `<SHARE_LINK>`". README says tasks were "drafted in a planning chat with Claude". | The link is an unfilled placeholder in the submitted README. The planning chat (task authoring, plus review of reports and code before each merge) is part of the AI workflow and is not provided. This is a visible sloppiness error. |
| 3 | We want to understand how you use AI. | met | README "How this project was built with AI" (about line 195), `CLAUDE.md`, `docs/tasks/`, `docs/reports/`, `.claude/agents/task-reviewer.md`. | The process is well documented, but it reads as AI wrote nearly everything (README says so). Evidence of the owner's own judgment is limited to "Owner's answer" lines in the reports. A critic would ask what the candidate coded or debugged personally. |
| 4 | You must be able to explain your code. | partly (cannot verify) | `docs/PAAISKINIMAI_LT.md` exists. README admits it is not the owner's writing but Claude's explanations for the owner. | The code is large (~2,300 lines in pages alone, plus 226 Go tests and 625 frontend tests). I cannot verify that it can be explained. Heavy abstraction (block registry, lazy routes, prefetch links, idempotency keys, SKIP LOCKED, trigram thresholds) is a lot for an intern to defend in an interview. |
| 5 | Shortcuts are allowed, specs are intentionally vague and open for interpretation - you decide the scope and you will have to justify it. | met | README "Scope and shortcuts (honest list)" and "Intentionally not built". | The scope is honestly listed. But the chosen scope is thin on content: 50 games / 108 products, games only (Eneba has DLC, gift cards, software, top-ups). The README presents "not built" items as a virtue. |
| 6 | Please implement a marketplace web application in Eneba's style that matches eneba.com website, with the following parts: | partly | Live site, desktop and mobile. The look is very close on home and store (violet header, yellow CTA, dark cards, Metropolis font). | It "matches" only structurally. No logo or brand mark (text wordmark "EneHomeworkBa"), no wishlist, no language/currency selector, no categories menu, only 4 hardcoded nav links, a permanent "Internship demo" banner. The footer is minimal. |
| 7 | Store: A catalog where visitors can browse every product in the marketplace. | met | `/store` desktop and mobile: 108 results, 24 per page, 5 pages (`GET /api/products?pageSize=2` → `total 108`). `/store?page=999` shows "That page does not exist… Go to the first page". | The catalog is small. Several cards show the identical cover for different platforms or editions (GTA V ×3 in a row), so the grid looks repetitive. The page has no heading/breadcrumb context beyond "Store". |
| 8 | They can narrow the list with filters (for example platform, region or price), change the order, and search by name. | met | Desktop sidebar and mobile "Sort and filter" drawer (`m_filter_drawer.png`). `/store?platform=psn&region=global&sort=price_asc&minPrice=1000&maxPrice=3000` → 5 results €11.49–€26.99 ascending, with a "Clear all" chip. Empty combination shows "No products match these filters" + "Clear filters". Invalid `sort=bogus` is ignored in the UI (the API returns 400). Search is covered in row 12. | There is no "Product type" filter, because every product is a game. Eneba's filters are collapsible and checkbox-based with the same look, so this is fine. The price slider has min and max inputs only. Facets show "Epic Games 0" next to a zero-result state. |
| 9 | Homepage: The landing page is assembled from several different blocks, such as a banner, best sellers or deals. | met | `GET /api/homepage` → 6 blocks: hero, tiles, platforms, popular, discounts, new-releases. Rendered in `src/features/home/BlockRenderer.tsx` (one renderer per type). Home on desktop and mobile shows hero carousel, 3 side tiles, platform row and 3 product rows. | The rows show the same game several times: "Popular right now" shows GTA V ×3 and Witcher ×2, "Biggest discounts" shows Mass Effect 2 ×2, and "New releases" shows Hades ×2. It reads as padding, not curation. Mobile platform row is clipped at the edge ("17 |"). The mobile tiles drop their subtitles. The hero's main banner is a friend's unreleased game ("INNERT, coming soon"), which is a shop banner that does not sell anything you can buy. |
| 10 | Each block gets its content from its own backend service or database, so the frontend only displays what it receives and nothing is hardcoded there. | mostly met (partly on "own backend service") | `pkg/server/router.go` has one endpoint per block: `GET /api/blocks/hero`, `/tiles`, `/platforms`, `/products/{key}`. Registry is `GET /api/homepage` backed by table `homepage_blocks` (`migrations/00006_homepage.sql:16`). Titles, slides, tiles and row configs come from the DB (`pkg/homepage/service.go`). Frontend `BlockRenderer.tsx` has only type→component maps. | Not hardcoded in the frontend, with small exceptions: the icon name→lucide map (`PlatformRow.tsx:14`), the accent name→gradient map (`SideTiles.tsx:12`), and the header nav (`src/app/navLinks.ts:20`). The hero banner image files sit in the frontend repo (`public/banners/`), only referenced by URL from the DB. All "services" are one Go function and one database (README admits it). Product rows just re-query the same catalog, so the "own service" separation is mostly in name. |
| 11 | Search: Visitors can search for products by name from anywhere in the app and see the matching results. | met | The header search box is on every page (desktop input; mobile search icon opens a full-width panel). "witchr 3" → suggestion "The Witcher 3: Wild Hunt Steam · GLOBAL From €10.99" plus "See all results". Arrow-Down + Enter opens the product. Mobile: same. `/store?q=…` shows "Results for 'elden' – 3 results – Clear search". | The suggestions list shows only one row per game, so a search for "gta" gives 4 distinct games and never shows editions or platforms. Enter with no highlighted item goes to the Store results (not tested in detail). The search UI has no recent/popular searches. |
| 12 | Search should cope with typos and partial names where it can. | partly | `pkg/catalog/search.go:18–99` (ILIKE contains OR trigram `word_similarity ≥ 0.55`) plus alias table. API checks: "witchr 3" → Witcher; "god of wr" → God of War; "assasins creed" → 7 Assassin's Creed results; "gta 5" → GTA V; "rdr2" → Red Dead 2; "elden" → Elden Ring. Failures: "wich" → 0 results, "cyberpunk" → 0 (not in catalog), "fifa" → 0. | Typo tolerance works only for moderate typos on long titles. The 0.55 cut-off was tuned on 50 games, so "wich" (a plain partial of Witcher) returns nothing. Loose matches also appear: "elden" returns Skyrim ("The Elder Scrolls"). The aliases ("gta", "rdr2") are a hand-fed table, not an algorithm. No-results state offers only "Check the spelling". |
| 13 | Product page: The page for a single product, showing its details and the offers from several sellers, so a buyer can compare and choose. | met | `/product/the-witcher-3-wild-hunt-steam-global` (desktop and mobile): 4 offers from 4 sellers sorted by price with discount, rating and "Only 2 left". Also a buy box with the best price, other versions, description, release date, developer, publisher. Unknown slug → "Page not found" (`GET /api/products/does-not-exist` → 404). | Layout inconsistency on desktop: the product page content starts at x=40 px (breadcrumb, cover, offers), while the header sits at x=120 and the store/cart pages are on other widths. The big area right of the title (between the key facts and the buy box) is empty. The cover is only ~224 px on desktop and 80 px on mobile. Seller review counts ("9,875 reviews", "860 reviews") are seeded fake numbers presented as real. The seller names are fictional and there are no seller pages. There are no screenshots/trailer and no system requirements. |
| 14 | Checkout: A buyer can put products in a cart, pay, and receive the digital key they bought. | met | Cart persists across pages (cart badge "1", localStorage). Cart → Checkout → `/checkout/<uuid>` → Decline: "Payment declined (simulated)… try again" → Success → `/orders/<id>` with `DEMO-••••-••••-••••` and Reveal/Copy → `DEMO-FO2B-EYPZ-BH36`. Works on desktop and mobile. `POST /api/orders` with a wrong price → 409 `cart_changed`; quantity 999 → 400. Code: `pkg/orders/store.go` (`FOR UPDATE SKIP LOCKED`, line 392). | The payment step is a Success/Decline radio plus "Pay €50.99": there are no payment-method choices and no card form (README says on purpose). Keys are hidden behind a Reveal toggle, with no email delivery or download. The cart is a page only, with no mini-cart popup. Eneba shows payment methods and a cashback line. After paying, Back from the order page goes to `/cart` (now empty). |
| 15 | Payment can be simulated or use a payment provider's test mode. No real money is involved. | met | Payment box labelled "Simulated payment – no real money, no card details". Server: `POST /api/orders/{id}/pay` with `outcome`. | Simulated only, with no provider test mode (Stripe test, etc.). A fake "pay" button that can end in decline only by choosing it is not a payment flow. A reviewer would call it the minimum. |
| 16 | Authentication: Visitors can create an account and sign in. | met | `/register` created `audit-u4b2l4@example.com` → redirected to `/`, header shows the email. Empty submit shows inline errors ("Enter your email", "Password must be at least 8 characters"). Mobile sign-in with the wrong password → "Invalid email or password"; correct password → `/orders` (next= honored). "Sign in as demo user" works. Code: argon2id `pkg/auth/password.go`, CSRF `pkg/server/origin.go:24`. | No email verification, password reset, or sign-out-everywhere (README admits it). The demo button creates a throwaway account that is never cleaned up. The desktop account chip truncates the email ("audit-u4b2l4@example.co…"). |
| 17 | Some parts of the app, such as checkout and order history, are only for signed-in users. | met | Signed out: `/orders`, `/orders/123`, `/checkout/123` → redirect to `/login?next=%2F…` (desktop and mobile). `/cart` stays open and "Checkout" sends you to `/login?next=%2Fcart`. API: `GET /api/orders` → 401 `not signed in`. Another user's order id (checked from a fresh demo session) → 404 on both `GET /api/orders/{id}` and `POST …/pay`. Cross-origin `POST /api/auth/login` and `/auth/demo` with `Origin: https://evil.example` → 403. Route guard: `src/app/routes.ts` (RequireAuth) and `pkg/server/router.go:71–75` (requireUser). | Nothing substantive. Minor: every signed-out page load logs a red `401 /api/auth/me` in the console. A foreign or unknown order shows the generic "Page not found". |
| 18 | Eneba styling: The app should look and feel like Eneba. | partly | Side-by-side with eneba.com screenshots (`eneba_d_home.png`, `eneba_d_store.png`, `eneba_m_home.png` vs `d_home.png`, `d_store.png`, `m_home.png`). Header, 3-banner hero, platform row and card grid are very close on desktop. | The brand is missing: no logo, no wishlist heart, no language/currency selector, no "Categories" menu, nav has 4 platform links versus Eneba's promotional nav. Eneba cards show a CASHBACK tag and a store badge on a dark footer; ours are simpler. The product page, cart and checkout use different content widths from the header. The mobile footer links have large vertical spacing. The permanent demo banner pushes everything down 32 px (two lines on mobile). |
| 19 | Colors, typography, spacing and components follow the design reference. | mostly met | `src/styles/tokens.css`, `docs/DESIGN.md`. Metropolis font self-hosted. Violet `#4618AC`-range header, yellow CTA, green price accents. axe: 0 violations on `/`, `/store`, product, `/orders`, `/cart` (desktop) and `/`, `/store`, product, `/login`, `/cart` (mobile). No horizontal scroll at 390 or 1440. | The tokens are a close measurement, but spacing differs: card grid gaps, container paddings (40 vs 120 px) and heading scale are not the same as Eneba's. Components such as the product page buy box are a re-interpretation, not Eneba's layout. |
| 20 | Flow: a purchase starts from the homepage or from search → product page → cart → checkout (sign-in required) → payment → order and key. | met | Walked: header search "witchr 3" → Enter → product page → Add to cart → Cart → Checkout → (signed-out: login gate, return to cart) → `/checkout/<id>` with a 15:00 reservation countdown → Pay → `/orders/<id>` with the key. Also from home: product row card → "Add to cart" button. Both viewports. | From the homepage the quickest path is the card's add-to-cart icon, which skips the offers comparison. The "Checkout" button in the cart is shown before sign-in with the note "You will be asked to sign in first". There is no confirmation e-mail or receipt. |
| 21 | Eneba styling applies to every screen. | mostly met | Screenshots of login, register, cart (empty and full), payment, order, orders, 404 and the filter drawer are all in the same theme. | The auth card is a narrow panel with no Eneba-style social sign-in. The empty cart, 404 and error pages are plain text with one button. The checkout/order pages share one narrow two-column layout that does not resemble Eneba's checkout. |

### 2. Bugs and rough edges found

1. **Product page layout misaligned (desktop 1440).** Steps: open `/product/the-witcher-3-wild-hunt-steam-global`. Expected: content aligned with the header container (x≈120). Actual: breadcrumb, cover, offer list and "Other details" start at x=40, the buy box ends at x=1400, and the cart/checkout pages use a third width (x≈215–1225). Pages visibly jump when navigating. Code: `src/app/Layout.module.css:12,20` (`--page-max-width`, `--page-max-width-wide`) vs the header.
2. **Duplicate-looking home rows (both sizes).** Open `/`. Expected: a varied "Popular right now". Actual: GTA V appears 3 times in a row (Steam/PSN/Steam GOTY), Witcher 3 twice, Hades twice, Mass Effect 2 twice. The same cover repeats.
3. **Console error on every signed-out page load (both sizes).** `GET /api/auth/me → 401` is logged as a red network/console error on each navigation. Expected: no error for a visitor.
4. **Typo/partial search gap.** `GET /api/search/suggest?q=wich` → 200 with empty list; `q=fifa`, `q=cyberpunk` also return nothing. "wich" is a four-letter partial of "Witcher". The 2–3 letter partial handling is "word-start only".
5. **Loose fuzzy match.** `q=elden` also returns The Elder Scrolls V: Skyrim (two editions) on the store page.
6. **Back after paying.** On `/orders/<id>` right after "Pay", browser Back goes to `/cart` (empty cart), not to the checkout page. The checkout page is replaced in history, so a user pressing Back sees "Your cart is empty".
7. **Mobile platform row is clipped** at the right edge (shows "17 |" cut off) with no scroll hint, and mobile tiles show only titles (subtitles hidden). Visible in `m_home.png`.
8. **Fabricated seller review counts.** Offers show "(212 reviews)", "(860 reviews)", "(9,875 reviews)" and ratings like "Excellent 9.63". These are seed data presented as real feedback, while README says buyer reviews are "intentionally not built".
9. **Desktop account chip truncates the email** ("audit-u4b2l4@example.co…"). I could not open the account menu / test sign-out because my script failed on that click, so sign-out is untested.
10. **Docs inconsistency.** README says 21 AI log files (there are 22) and still has the literal text `<SHARE_LINK>` (README.md:223).

No security bugs found: foreign order id → 404, pay on a foreign order → 404, cross-origin POST → 403, tampered price → 409, quantity 999 → 400, protected API without session → 401, no horizontal scroll, axe clean on all 10 page/viewport runs.

### 3. Top 10 things a reviewer would criticise (most serious first)

1. The planning chat link is an unfilled placeholder (`README.md:223`), and the AI logs are shortened conversions that drop Claude's thinking and truncate tool output, not the "full" logs the assignment requires.
2. Nearly all code is AI-written (README says so) and is very large and abstract for an intern. The "be able to explain your code" requirement carries real risk and cannot be verified from the repo.
3. Eneba look is a re-interpretation with the brand stripped out: text wordmark, no wishlist, language/currency or categories menu, a permanent demo banner, and a minimal footer.
4. Page-width inconsistency: the product page sits at 40 px, the header at 120 px, cart/checkout at ~215 px, so layouts jump between screens (desktop).
5. Thin catalog: 50 games, games only. The grid and home rows show the same cover repeatedly (GTA V ×3), so the home page looks padded.
6. Search typo handling is limited: "wich" returns nothing, plus loose matches like "elden" returning Skyrim. Tuning relies on a hand-fed alias table and a threshold set on 50 games.
7. Homepage "own backend service" is logical only: one Go function and one database, with product rows re-querying the same catalog. A friend's unreleased game is the lead banner.
8. Payment is only a Success/Decline radio and a Pay button (no provider test mode, no payment-method choices). Keys are shown on-screen only, with no email or download.
9. Fake seller review counts and ratings are shown as real data on the product page and offers.
10. Small polish issues: a red 401 `/api/auth/me` console error on every signed-out page, Back after payment lands on an empty cart, a clipped mobile platform row, loose mobile footer spacing, and a truncated email in the account chip.

Screenshots and scripts are in `C:\Users\dovyd\AppData\Local\Temp\claude\27133936c4ab5668\5b0298dd-9ac9-446d-a99e-b23ae498650d\scratchpad\tools\audit\`.

---

### 2.7 My comments on the audit, finding by finding

I checked every finding against the code and, where it was about looks, against eneba.com. The task's rule: fix when small and clearly right, otherwise no change → §6 with a recommendation.

| # | Finding (audit row / bug / top-10) | What I checked | Decision |
|---|---|---|---|
| F1 | `<SHARE_LINK>` placeholder, "21 files" (row 2, bug 10, top 1) | README.md:222-223; `ai-logs/` has 22 files, 23 with this session's log | **Fixed**: link (known fix 3, the owner provides the real one), counts updated |
| F2 | Logs not "full": thinking omitted, tool I/O shortened (row 1, top 1) | the header of every converted log says so openly; the first log (2026-11-19) is a real `/export` | **No change → §6 Q1** (recommend: document in README) |
| F3 | Almost all code AI-written; "explain your code" is a risk (rows 3–4, top 2) | README "Who did what" says it openly; `docs/PAAISKINIMAI_LT.md` exists for this | No code change; interview preparation is the owner's |
| F4 | Product page at x = 40, header at 120, cart at ~215 → "pages jump" (bug 1, rows 13/18/19, top 4) | **measured live (§2.5):** Eneba's product page is the same (title 294, cover 40, buy box to 1400, header 120); cart/payment = Eneba's checkout width 1010 px (measured on `eneba.com/checkout`, Task 16b) | **No change** – it copies Eneba; the audit did not capture Eneba's product page or checkout (it says so) |
| F5 | Home rows repeat a game (GTA V ×3, Witcher ×2…) (bug 2, rows 7/9, top 5) | the rows list *products* (game × platform × edition) by the Store query | **No change → §6 Q2** (recommend: fix, small separate task) |
| F6 | Red `401 /api/auth/me` in the console when signed out (bug 3, row 17, top 10) | `getCurrentUser` treats 401 as "signed out"; the browser itself logs every 4xx response | **No change → §6 Q3** (recommend: leave) |
| F7 | Search: `wich` finds nothing, `elden` also shows Skyrim, `fifa`/`cyberpunk` nothing (bugs 4–5, row 12, top 6) | production: `witc` → The Witcher 3 (a true partial works); `wich` is a partial **plus** a typo, under the 0.55 threshold tuned in Task 13a (lower lets *the witcher* find *Zelda*); `elden` → Elden Ring **first**, then Skyrim ("elder", similarity ≈ 0.67 – typo tolerance working); FIFA and Cyberpunk are not in the 50-game catalog, so 0 is right | **No change** |
| F8 | Back after paying lands on the empty cart (bug 6, row 14) | `PaymentView.tsx:49` replaces the history entry on purpose ("Back must not return to a paid order's payment page"); the cart is empty because it was bought | **No change** |
| F9 | Phone platform row clipped ("17 \|"), phone tiles without subtitles (bug 7, row 9) | the row is a horizontal scroller (`PlatformRow.module.css:15`); the cut item is the "there is more" hint – Eneba's own phone row is cut the same way ("E-m…" in the audit's `eneba_m_home.png`); subtitles hidden ≤600 px on purpose (`SideTiles.module.css:108`) | **No change** |
| F10 | Seller ratings and review counts are invented seed data shown as real (bug 8, row 13, top 9) | they come from `seedgen` (8 fictional sellers); README says "8 fictional sellers" but not that ratings/reviews are invented | **No change → §6 Q4** (recommend: one README line) |
| F11 | Desktop account button cuts a long e-mail; sign-out not tested (bug 9) | cut at `--account-name-max-width` on purpose (DESIGN.md 3.1); sign-out **tested by me** on production and locally, both sizes (§2.2) – works | **No change** |
| F12 | Brand stripped: no logo, ♡, locale, categories; demo banner; small footer (rows 6/18, top 3) | not copying Eneba's logo/icons is a project rule; ♡, locale, categories are in README "Intentionally not built"; the demo banner is a deliberate safety measure (README security notes) | **No change** |
| F13 | Home "services" only logical; icon/accent name maps in the frontend; banner files in `public/` (row 10, top 7) | README already says "logical, not separate deployments"; `PlatformRow.tsx:14` / `SideTiles.tsx:12` map a *name* from the database to an icon / gradient (looks, not content); slide image URLs come from the DB, the files are static assets | **No change → §6 Q5** (recommend: one README clause) |
| F14 | Payment simulated only, keys on screen only (rows 14–15, top 8) | the assignment allows a simulated payment; README Scope lists it | **No change** |
| F15 | Thin catalog, games only (rows 5, 7) | README: 50 IGDB games × platforms × regions, by choice | **No change** |
| F16 | Facet "Epic Games 0", price inputs, no product-type filter (row 8) | facets are counted with the *other* filters, so a 0 option stays visible and can be unticked; one product type only | **No change** |
| F17 | Suggestions one row per game (row 11) | deliberate (Task 13b: one row per game, cheapest version; editions in the Store results) | **No change** |
| F18 | The card's cart button skips the offers; no receipt e-mail (row 20) | the card adds the cheapest offer = the product page's buy box; the flow through the product page works (§2.3) | **No change** |
| F19 | Auth panel without social sign-in; plain empty/404 pages; checkout layout (row 21) | social sign-in is in "Intentionally not built"; the checkout layout was measured on `eneba.com/checkout` (Task 16b) | **No change** |
| F20 | Phone footer links spaced far apart (row 18) | each link is a 40 px row (`--hit-target-min`, `Footer.module.css:77`) – the tap minimum | **No change** |
| — | **Edge showed two eyes in the password field** (my own finding, §2.2, not in the audit) | screenshot before/after | **Fixed** (`TextField.module.css`) |

Summary: of the audit's findings only F1 was small and clearly right; it is fixed. F4, F8, F9 and F11 turned out to be deliberate or copied from Eneba (F4 and F9 checked on eneba.com today). F2, F5, F6, F10 and F13 need the owner's decision (§6). The rest are scope choices already documented in the README.

### 2.8 GitHub CI

<!-- CI -->

## 3. What the owner must do manually

1. **The planning chat link.** README line "The planning chat" says `https://claude.ai/share/OWNER_FILLS_IN` until you send the real share link in the chat. I replace it, then push that commit (task §3.3: not pushed before asking).
2. **No migration, no seed** – nothing to run in GitHub Actions.
3. **Preview** (behind your Vercel login), desktop width: signed out, the header shows "👤 Sign in | Register"; *Register* opens `/register?next=…` of the page you were on, *Sign in* opens `/login?next=…`; after signing in both are replaced by the account menu, after signing out they are back. Narrow the window below 930 px: only the account icon; ☰ shows "Sign in" and "Create account". **In Edge**, type into a password field: only one eye icon.
4. Answer the open questions (§6), then merge.
5. After the merge: open <https://enehomeworkba.vercel.app> on a desktop, signed out: "Sign in | Register" is in the header.
6. Optional, your PC: two old processes from **2026-11-21** are still running – a `local.exe` (an old `go run ./cmd/local`) listening on `[::]:8080` (all IPv6 addresses, not loopback) and a `vite preview` on `[::1]:4173`. They are not from this session and I did not stop them. Close them, or tell me to.

## 4. Plain-language explanation

- **What a stranger thinks.** Before touching anything, a separate AI reviewer with no knowledge of our decisions checked the live site and the code against the assignment, sentence by sentence. It found **no broken requirement and no security problem**. Its sharpest points were the unfilled planning-chat link, the logs not being "full", repeated games on the home page, and how much of the code an intern must be able to explain. I checked each point. Some were already deliberate copies of Eneba: the product page width matches eneba.com to the pixel, and the cut-off phone row is how Eneba does it too. Those stay. The ones that need your decision are in §6.
- **"Sign in | Register" (header).** Eneba shows both words next to the account icon. Before, we showed only "Sign in", and a new visitor had to find "Create an account" on the next page. Now both are in the header, and both bring you back to the page you were on. On phones there is no room for words, so only the icon stays, as on Eneba, and "Create account" is in the ☰ menu.
- **Two eyes in the password field (Edge).** Edge adds its own "show password" button to every password field. Ours already has one, so Edge users saw two. One CSS line hides Edge's.
- **Sign-in on production works.** Register, sign out, sign in again and a wrong password all behave correctly, in the API and in a real browser, on desktop and phone.
- **README.** It now says that a short earlier chat chose the stack and hosting and why that chat is not shared. It also has the link to the planning chat and up-to-date counts.

## 5. Deviations from the task and why

- **Preview not opened by me.** It is behind Vercel Authentication. The same build ran locally against Neon `dev` (§2.3, 26/26), and production was smoke-tested as it is now. The Preview click-through is in §3.
- **"Production smoke test again after the Preview"** ran on production **before** the merge, so it tests `main`. The header change reaches production only after the merge; the after-merge check is §3, step 5.
- **The README commit was held back from the first push** (the branch was first pushed up to the commit before it), so the Preview could build without pushing the link line before the owner answered.
- **One fix that is not from the audit:** the Edge double eye. I found it in the sign-in check (§2.2). It is small and clearly right, so it is fixed and listed in §2.7.
- **Two counts in the README depend on this PR:** "23 files" counts this session's log (committed on this branch), and "254 commits on `main` before the last task" is `main` before Task 19.
- **The audit subagent could read the repository**, including `CLAUDE.md`, `docs/tasks/` (this task's known fixes too) and `docs/reports/`. It was told not to use them as justification (§2.6), but that cannot be enforced technically.

## 6. Open questions

Recommendations are mine. Nothing here was changed.

| # | Question | Recommendation |
|---|---|---|
| Q1 | **"Full" logs (F2).** The assignment asks for full conversation logs. Ours keep every message and reply in full, but shorten tool inputs and outputs and leave out Claude's thinking. The raw transcripts can't be committed as they are (secrets, size). | **Document in README** (under "Claude Code sessions"), e.g.: *"Each log has every message of the owner and every reply of Claude Code in full; tool calls are shortened and Claude's internal reasoning is not included; secrets and e-mail addresses are redacted. The unshortened transcripts can be shared on request."* Only promise the last part if you can keep the JSONL files. |
| Q2 | **Repeated games in the home rows (F5).** "Popular right now" shows GTA V three times (Steam, PSN, GOTY). It is the first thing a reviewer sees. | **Fix, as a small separate task:** home product rows show one product per game (the cheapest or most popular version); the Store stays as it is. It touches the row query in `pkg/homepage` and its integration tests, so not in this PR without your OK. |
| Q3 | **`401 /api/auth/me` in DevTools when signed out (F6).** | **Leave it.** 401 is the correct HTTP answer to "who am I?" without a session (GitHub's API does the same), the README documents it, and the app treats it as "signed out". The alternative, `200 {"user": null}`, changes a documented API contract, the frontend and the tests for a cosmetic console line. |
| Q4 | **Invented seller ratings and review counts (F10).** | **Document in README Scope**, e.g.: *"Sellers are fictional, and their ratings and review counts are invented seed data (there are no buyer reviews)."* |
| Q5 | **"Nothing hardcoded" on the home page (F13).** The frontend maps an icon name and an accent name from the database to an icon and a gradient; banner files live in `public/`. | **Document (one clause)** in the README Homepage row: *"the database chooses the icon and colour by name; the frontend only maps names to drawings, and the banner image files are static assets the database points to."* Or ignore; it is presentation, not content. |
| Q6 | **The sign-in trouble you had.** Every check passes now (§2.2). Most likely causes: (a) the account was created on a **Preview** URL – Previews use the Neon `dev` database, so the account does not exist on production (and the other way round); (b) after **10 wrong passwords for one e-mail in 15 minutes** sign-in answers "Too many attempts" for 15 minutes; (c) the double eye in Edge (now fixed) made the password field confusing. | Tell me which URL it was and the exact message, if you remember. Nothing in the code needs a change for (a) or (b). |
| Q7 | The two old processes from 2026-11-21 (§3, step 6). | Close them. The `local.exe` one listens on all IPv6 addresses and predates the 127.0.0.1-only rule. |

## 7. Self-review (task-reviewer)

The `task-reviewer` subagent ran on the branch after the code and doc commits and **before this report existed**. It got only the task number. Its output, verbatim:

> # Task review: TASK_19_final_audit.md
> Branch: task/19-final-audit   Commits: 5 (task file + 4)   Files changed: 8
>
> Only the diff (Header, CSS, tests, README, DESIGN/PAAISKINIMAI) exists so far. There is no report, no audit table and no session log on the branch yet.
>
> ## 1. Requirements
> | # | Requirement | Status | Evidence |
> |---|-------------|--------|----------|
> | 0 | Task file saved verbatim as the first commit | done | 9ef844a, docs/tasks/TASK_19_final_audit.md |
> | 2 | Fresh-eyes audit by a separate subagent (live site, desktop + phone), its table verbatim in the report | missing | docs/reports/TASK_19_*.md does not exist yet. Nothing in the repo shows the audit ran. Expected: the report is written after this review. |
> | 3.1 | "Sign in \| Register" in the desktop header, both keep `next` | done | src/app/Header.tsx:119-133. `authPageLink` is used for both links. CSS at src/app/Header.module.css:84-101. |
> | 3.1 | Phone: "Create account" in the drawer is checked | done | src/app/MenuDrawer.tsx:96-97 (with `next`). Test at src/app/AccountMenu.test.tsx:181-187. The header hides the divider and Register at ≤930px (Header.module.css:224-228). |
> | 3.1 | Tests | done | src/app/AccountMenu.test.tsx:70-95 cover href with `next`, a query string, home without `next`, the aria-hidden divider, and signed in/out. |
> | 3.2 | README: honesty about the earlier planning conversation | done | README.md:224. It matches the wording the task asked for. |
> | 3.3 | README planning chat link set to `https://claude.ai/share/OWNER_FILLS_IN`, and the real link asked from the owner before pushing | partly | The placeholder URL is in README.md:223, as the task literally says. The real link is not there. The report must list this as an owner step, and the owner must be asked before the push. |
> | 3.4 | Sign-in sanity check on production, reported exactly | missing | Not verifiable from the repo. It must be in the report. |
> | 4 | Audit findings: small ones fixed and listed, the rest under Open questions | missing | There is no report yet. The Edge `::-ms-reveal` fix (src/components/TextField.module.css:59-63) is a fix that came from the audit or the production check. It must be listed in the report as such. |
> | 5 | Standard checks, production smoke test, axe 0 on changed pages | missing | No report yet. The claims cannot be verified from the repo. |
> | Report | docs/reports/TASK_19_*.md with sections 1-7, plus the session log committed in ai-logs/ | missing | Neither exists on the branch. |
>
> ## 2. Not asked for (scope creep)
> - src/components/TextField.module.css:59-63 hides Edge's password-reveal eye. It is not in the task's known-fixes list. It is small and clearly right, and the task allows such fixes only if they are listed. Cover it in the report under audit findings. It also touches DESIGN.md and PAAISKINIMAI_LT, which is consistent.
> - README.md:219-224 changes the counts (25 tasks, 22 PRs, 254 commits, 23 logs, 628 tests). This is natural for the README edit, but see section 5 about the numbers.
>
> ## 3. CLAUDE.md violations
> None found.
> - I checked tokens only: `--space-1`, `--font-size-sm`, `--font-weight-medium` and `--line-height-none` all exist in tokens.css. There are no hardcoded colors or sizes. The CSS is Module-only and the breakpoint 930 is used.
> - go.mod is not in the diff. There are no migrations, no `fetch` and no secrets.
>
> ## 4. Missing explanations / tests
> None found for the code.
> - Comments are in place in Header.tsx and the CSS.
> - PAAISKINIMAI_LT.md has sections for both changes.
> - DESIGN.md is updated.
> - No test covers the `::-ms-reveal` CSS. That is acceptable, since it is visual only.
>
> ## 5. Other observations
> - README.md:219-222 claims "23 files" in ai-logs/. Only 22 exist now, and the Task 19 session log is not committed. The README is true only if the Task 19 log is exported and committed on this branch.
> - README.md:219 says "25 tasks". docs/tasks has 29 files. That is 25 task numbers if the amendments and 01b/10b/13a-c are counted as in the earlier README, so it is probably consistent. Unsure. The owner should check how the count was made.
> - "254 commits on main before the last task" matches `git rev-list --count main` = 254.
> - "628 frontend tests" and "50 files" cannot be verified without running Vitest. The report must show the output.
> - The planning chat link is still a placeholder (`OWNER_FILLS_IN`). Do not push without asking the owner, as task 3.3 requires.
> - Nothing from the fresh-eyes audit is reflected in the diff, apart from the Edge eye fix.
>
> ## Verdict: CHANGES NEEDED
> The code and docs in the diff are clean and match known fixes 1 and 2. Before this passes, the branch still needs:
> - the audit table, the production sign-in result and the verification results in the report, plus the session log
> - the real planning-chat link, asked from the owner (3.3 is only partly done)
> - the Edge fix listed as an audit finding in the report

**What was done about each point:**

| Reviewer point | Action |
|---|---|
| §2 audit table missing; §4 findings; §5 checks; report missing | Expected at that moment (the report is written after the review, CLAUDE.md). This report has the audit verbatim (§2.6), each finding with its decision (§2.7), the checks (§2.1–2.5) and the open questions (§6). |
| 3.3 planning link only partly done | Correct. The real link must come from the owner; asked in the chat before pushing (§3, step 1). |
| 3.4 sign-in check not verifiable from the repo | In §2.2 (API and UI, both sizes, exact results). |
| Edge `::-ms-reveal` fix must be listed | Listed in §1, §2.2, §2.7 (own finding) and §5. |
| "23 files" true only with this session's log | The log is committed on this branch (§1). |
| "25 tasks" unsure | Same counting as the earlier README's 24 (task numbers 01, 01b, 02–10, 10b, 11, 11b, 12, 13a–c, 14, 15, 16a, 16b, 17, 18; amendments not counted) + Task 19 = 25. |
| "628 tests" not verifiable without Vitest | Output in §2.1: 50 files, 628 tests pass. |
| Verdict CHANGES NEEDED | The code and docs had no findings (no CLAUDE.md violation, no missing test or explanation). Everything it listed is the report, the log and the owner's link, which come after the review. |
