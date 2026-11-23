# Task 17 – Polish: instant navigation, performance, resilience, final parity pass: report

Task file: [`docs/tasks/TASK_17_polish.md`](../tasks/TASK_17_polish.md) (incl. the addendum: carousel swipe, hero LCP chain) · Branch: `task/17-polish` · **No migration in this PR** (the registry gains a JSON field; no schema change).

## 1. Files changed

**Prefetch on intent (decision 1)**
- `src/app/prefetch.ts` (new) – `planPrefetch(to)` (pure: which page chunk + which data a link target needs), `prefetchRoute(queryClient, to)` (fresh-window dedupe `PREFETCH_FRESH_MS` = 30 s, orders only when signed in, nothing with Data Saver), `HOVER_DELAY_MS` = 80.
- `src/components/PrefetchLink.tsx` (new) – the app's internal link: hover ≥ 80 ms (cancelled on leave / unmount), focus, touchstart; the caller's own handlers still run.
- Every internal link now uses it: `Header`, `MenuDrawer`, `Footer`, `AccountMenu`, `Toaster` (action link), `Breadcrumb`, `ButtonLink` (`Button.tsx` – so "View all", the hero CTA, tiles' and empty states' buttons), `AuthPage` (switch link), `CartLineItem`, `CartView`, `PlatformRow`, `SideTiles`, `OrderList`, `OrderItemList`, `BuyBox`, `VariantList`, `SearchBox` ("See all results"), `SuggestionOption`, `ProductCard`, `NotFoundPage`.
- Replaced the ad-hoc prefetch: `ProductCard` and `VariantList` lose their own `onMouseEnter/onFocus` prefetch; `SuggestionOption` loses `onPrefetch` (the row is a PrefetchLink); `SearchBox`'s ↓/↑ prefetch now calls `prefetchRoute` (the active row never gets focus, so a link handler cannot see it).
- `src/main.tsx` – starts the opened URL's data request before the first render (`prefetchRoute(queryClient, location)`); `/` now plans the home registry.

**Code splitting (decision 2)**
- `src/app/lazyPages.ts` (new) – `pageLoaders` (one `import()` per lazy page, shared by the routes and the prefetch), `loadAllPages` (tests).
- `src/app/routes.ts` – cart, checkout, orders, order, login, register use route `lazy`; `HydrateFallback: PageSkeleton` on the error-boundary route; `ErrorBoundary: AppError` on the root.
- `src/components/PageSkeleton.tsx` + `.module.css` (new).

**Performance (decision 3 + addendum)**
- `index.html` – `preconnect` `https://images.igdb.com`; `preload` Metropolis 500 + 700 (Vite rewrites the paths to the hashed files).
- `pkg/homepage/types.go` – `Registry.Preload` (`{"heroImage": SlideImage|null}`); `pkg/homepage/service.go` – `heroSlides(ctx, limit)` is now the ONE place of the slide rules (shared by `Hero` and the hint), `firstHeroImage` (a failure only logs and drops the hint).
- `src/features/home/heroImage.ts` (new) – `HERO_PHONE_MEDIA`, `HERO_PHONE_SIZES`, `HERO_SIZES`, `preloadHeroImage` (React `preload()`, crop by the same media query).
- `src/pages/HomePage.tsx` – preloads the hinted picture as soon as the registry arrives; `src/api/types.ts` – `HomepageResponse.preload?`.
- `src/features/home/HeroCarousel.tsx` – `HeroPicture` (shared `<picture>`); while the slides load the placeholder already draws the hinted picture (read from the registry cache, no request).

**Resilience (decision 4)** – `src/app/RouteError.tsx` (page crash: h1, Retry + Home, title), `src/app/AppError.tsx` + `.module.css` (new; frame crash: full page), `src/components/ErrorState.tsx` (+ `as` heading level, extra actions slot) + `.module.css` (`.actions`).

**SPA accessibility (decision 5)** – `src/app/RouteAnnouncer.tsx` (new; focus h1 / main + polite title announcement on a path change), `src/app/Layout.tsx` (+ RouteAnnouncer, comment on the existing skip link), `Layout.module.css` (no ring on the script-focused h1); unique titles: `ProductPage.tsx` ("{game} ({platform} · {region}[ · edition])"), `OrderPage.tsx` ("Order #…"), `CheckoutPage.tsx` ("Payment for order #…").

**Swipe (addendum)** – `src/features/home/useCarousel.ts` (`SWIPE_MIN_PX`, `swipeDirection`, pointer handlers in `rootProps`), `HeroCarousel.module.css` (`touch-action: pan-y pinch-zoom`).

**Parity (decision 6)** – `src/pages/NotFoundPage.tsx` (secondary `ButtonLink`); `docs/screenshots/*.png` (22 files: 11 pages × desktop / mobile).

**Tests** – new: `src/app/prefetch.test.ts`, `src/components/PrefetchLink.test.tsx`, `src/app/errorPages.test.tsx` (page crash, frame crash, chunk that cannot be downloaded), `src/app/RouteAnnouncer.test.tsx`; `pkg/homepage/service_test.go` (+3 registry preload tests), `pkg/server/homepage_handlers_test.go` (preload in the JSON); `HomePage.test.tsx` (+4 preload / placeholder), `HeroCarousel.test.tsx` (+5 swipe), `routes.test.tsx` (+ lazy page skeleton test).
Changed for lazy pages / PrefetchLink / new titles: `routes.test.tsx`, `AuthPage.test.tsx`, `AccountMenu.test.tsx`, `ProductPage.test.tsx`, `CheckoutPage.test.tsx`, `testApp.tsx` (load the lazy modules up front; two `act()` rounds when mounting), `Toaster.test.tsx`, `Button.test.tsx` (QueryClientProvider), `ProductCard.test.tsx`, `SearchBox.test.tsx` (80 ms hover delay).

**Docs** – `docs/DESIGN.md` (3.4 hero preload + swipe + sizes; 4.9 error page, 404; 4.10 page skeleton; 5.2 skip link, page-change focus, tab titles; the `lang` line corrected), `docs/PAAISKINIMAI_LT.md` (Task 17 block + pointer in the Task 15 LCP answer), `README.md` (registry JSON + API table, layout list, `docs/screenshots/`), this report, the task file.

No new dependency, no new token (the skeleton and error page use existing tokens).

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...`, `go test ./...` | pass (integration tests skip locally: `TEST_DATABASE_URL` empty; CI runs them) |
| `npm run lint` | clean |
| `npm test` (PowerShell) | **50 files, 625 tests pass** (`main`: 46 files / 573 tests) |
| `npm run build` | passes; bundle table below |
| axe-core 4 (WCAG 2.0/2.1 A + AA, best practice), headless Edge | **0 violations in all 22 runs**: home, store, store with search, product, cart, payment, order, orders, login, register, 404 – each at 1440 and 390 px (the 404 again after its button change: 0 / 0) |
| Unique tab titles | all 11 pages differ: "EneHomeworkBa – internship demo", "Store", "Results for 'witcher'", "The Witcher 3: Wild Hunt (Steam · GLOBAL)", "Cart", "Payment for order #4EDF29C6", "Order #4EDF29C6", "Orders", "Sign in", "Create account", "Page not found" (each + " – EneHomeworkBa") |
| Loopback | API `cmd/local` on 127.0.0.1:8095 (Neon `dev`); `vite preview` on 127.0.0.1:4197 (baseline build), 4198 (branch), 4199 (A/B variants); Vite dev on 127.0.0.1:5174 (error-page check). Nothing on 0.0.0.0. Scripts, preview configs and Eneba's reference screenshots stayed in the session scratchpad. A Node server on 4195, a Vite server on 5173 and a `local` process on `:::8080` were already running before this session; they are not mine and were left alone. |

### Bundle sizes (`npm run build`)

| File | `main` (before) | this branch (after) |
|---|---|---|
| main JS `index-*.js` | 469.04 kB · gzip **149.24 kB** | 450.72 kB · gzip **144.03 kB** |
| main CSS `index-*.css` | 78.80 kB · gzip 13.35 kB | 65.71 kB · gzip 11.66 kB |
| `CartPage` | (in main) | 8.85 kB · gzip 3.64 kB (+ CSS 3.50 kB) |
| `AuthPage` (shared by `LoginPage` 0.18 kB and `RegisterPage` 0.18 kB) | (in main) | 4.85 kB · gzip 2.10 kB (+ CSS 2.91 kB) |
| `CheckoutPage` | (in main) | 4.47 kB · gzip 1.95 kB |
| `OrderPage` | (in main) | 3.71 kB · gzip 1.67 kB |
| `OrdersPage` | (in main) | 1.71 kB · gzip 0.88 kB |
| shared small chunks (`OrderItemList`, `orderText`, `StatusBadge`, `CheckoutLayout`, the `eye` icon) | (in main) | 3.3 kB together |

The main chunk shrank by only ~5 kB gzip. By module size (rendered, before minification; scratchpad analysis) it is react-dom ~638 kB, react-router ~248 kB, our `src` ~157 kB, TanStack Query ~153 kB, lucide ~22 kB. The six lazy pages are a small part of it.

### Lighthouse mobile – before / after

**Conditions:** Lighthouse 12 (programmatic) with the default **mobile** preset: Moto G Power emulation, simulated slow 4G (150 ms RTT, 1.6 Mbps), 4× CPU slowdown; headless Edge; the **production build** served by `vite preview` (gzip, HTTP/1.1) on 127.0.0.1; the API is `cmd/local` on 127.0.0.1 talking to **Neon `dev` over the internet** (no CDN cache; the registry takes ~86 ms warm); **median of 3 runs** per page; idle machine. Production differs in the app's favour: Brotli, HTTP/2, the home page API answered from Vercel's CDN cache, `fra1` next to Neon.

| Page | Before (`main` 298bb1a): score / LCP / CLS / TBT / FCP | After (build of the performance commit 9626c74) |
|---|---|---|
| Home `/` | 78 / **4.94 s** / 0.001 / 110 ms / 2.29 s | 95 / **2.68 s** / 0 / 99 ms / 1.75 s |
| Store `/store` | 94 / **2.51 s** / 0.001 / 98 ms / 2.16 s | 95 / **2.58 s** / 0.002 / 108 ms / 1.83 s (a second 3-run set: **2.48 s**, FCP 1.82 s) |
| Product `/product/grand-theft-auto-v-steam-global` | 95 / **2.59 s** / 0.001 / 46 ms / 2.20 s | 97 / **2.47 s** / 0 / 57 ms / 1.72 s |

Individual runs (after): Home 2.66 / 2.69 / 2.68 s; Store 2.50 / 2.63 / 2.58 s and 2.50 / 2.19 / 2.48 s; Product 2.05 / 2.47 / 2.64 s.

**Home LCP step by step** (the hero `<img>` is the LCP element in every run):

| Step | Home LCP (median of 3) | LCP breakdown |
|---|---|---|
| baseline | 4.94 s | load delay 3.09 s (bundle → registry → hero block → image), render delay 1.02 s |
| + registry `preload.heroImage` → `<link rel=preload as=image>` | 4.24 s | load delay 1.58 s, **render delay 2.14 s** (the `<img>` still waited for `/api/blocks/hero`) |
| + the hero placeholder draws the preloaded picture | 2.70 s | load delay 1.63 s, render delay 0.30 s |
| + `main.tsx` starts the route's data before the first render | 2.68 s | in Lighthouse's simulation the registry still waits for the JS; on a real phone this saves the first render |

**Target (CLS < 0.1, LCP < 2.5 s on Home and Store):** CLS is met everywhere (≤ 0.002). **LCP < 2.5 s is not reliably met locally:** Home **2.68 s** (from 4.94 s), Store **2.48–2.58 s** depending on the run set. The Store's LCP element is the demo-banner text, which can only paint after the 144 kB main JS has run. What is left is the main JS download and parse under 4× CPU throttling and, for Home, the registry round trip from this machine to Neon. On the Vercel preview (CDN-cached registry, Brotli, HTTP/2) it should be lower – see §3.

**Other measurements behind the decisions:**
- Font preload A/B (Store, same build): with the 500 + 700 preloads LCP 2.48 s / FCP 1.82 s; without them 2.64 s / 2.28 s → kept. With `fetchpriority="low"` on them: Home 2.76 s, Store 2.40 s, within noise → not used (simpler).
- Above-the-fold text by weight (characters in the first viewport, weights 400 / 500 / 700): 390 px – home 95 / 102 / 234, store 35 / 93 / 242, product 122 / 103 / 147; 1440 px – home 159 / 145 / 158, store 24 / 242 / 293, product 145 / 170 / 221 → preload 500 + 700.
- `<link rel="preload" as="fetch" href="/api/homepage">` from an inline script in `index.html` (to run the registry in parallel with the JS): the registry was requested **twice in 4 of 6 loads** (the preload was not reused by `apiFetch`'s request) → rejected.
- Hero `sizes`, measured width of the hero `<img>`: 1440 → 1008 px (= 70vw), 1920 → 1488, 1200 → 768, 1024 → 592, ≤ 930 → 100vw. The true rule above 930 px is `100vw − 432px` (three side tiles), but the tiles are server content that can be switched off; `70vw` picks the same file at every width checked → kept, now shared with the preload (`heroImage.ts`).
- No duplicate requests after the changes (request log): one `/api/homepage`, one hero picture (`innert-hero-1280.webp` at 1440, `innert-mobile-768.webp` at 390), no "preloaded but not used" console warning.
- A rerun on the final build happened while the machine was at 100 % CPU (another application, not mine): TBT 0.7–3.4 s, LCP 2.3–7.2 s with a huge spread – not comparable, not used. Between 9626c74 and the final build only the swipe handlers, the 404 button and tests changed.

### Manual checks (headless Edge against the branch build + the API on Neon `dev`)

| Check | Result |
|---|---|
| Hover a product card (Store, 1440) → product request before the click | nothing after 40 ms (hover delay), then the request, **before the click**; the click opened the page from the cache – **1** request in total for that product |
| Hover "Sign in" | `LoginPage`, `AuthPage` (JS + CSS) and the `eye` icon chunk downloaded before any click |
| Phone touch emulation (390, touch): finger down on a card, not lifted | the product request starts. The page made **1** `fetch()` call (counted by wrapping `window.fetch`); the browser's protocol log once listed it twice (second entry: initiator "other") – a reporting duplicate, not a second request |
| Focus after a click (Store → product) | `document.activeElement` = the product's `<h1>`; live region "Grand Theft Auto V (Steam · GLOBAL) – EneHomeworkBa" |
| Swipe (390, touch emulation) | left swipe on the carousel: slide 1 → 2; a vertical drag over the carousel: slide unchanged, page scrolled 0 → 495 px |
| Error page | a **temporary** `throw` in `NotFoundPage` behind `?crash` on the Vite dev server (reverted with `git checkout`, never committed): "Something went wrong" + Retry + Home inside the layout, title "Something went wrong – EneHomeworkBa", at 1440 and 390; Home → `/` and the error was gone. The automated equivalents are in `errorPages.test.tsx` (page crash, frame crash, chunk download failure) |
| "Waking up the server…" | still rendered by `Layout`, outside the page error boundary (unchanged code; its tests pass) |

**Screenshots (ours):** `docs/screenshots/{home,store,store-search,product,cart,payment,order,orders,login,register,404}-{desktop,mobile}.png` (1440 × 900 and 390 × 844, first screen, reduced motion so the carousel holds still).
Reference: headless Edge, one load per page and width of `eneba.com/`, `/store/all`, `/store/all?text=witcher` and a missing page, 2026-11-23; kept outside the repo.

**Dev data note:** the signed-in screenshots went through the real flow (demo sign-in → checkout → simulated payment) on Neon `dev`. Those test purchases used up the last fake key of **Grand Theft Auto V (Steam, GLOBAL)** on `dev`, so the screenshots show it as "Out of stock", and the dev hero shows 2 slides (its slide is skipped, as designed). Production is untouched.

## 3. What the owner must do manually
1. **No migration in this PR** – no pre-merge *Migrate production* run is needed.
2. On the **Vercel preview**: hover a Store card and watch DevTools → Network (the `/api/products/<slug>` request appears before the click); in phone emulation touch a card; swipe the home carousel; open `/cart` directly (skeleton, then the page).
3. Optional: run Lighthouse **mobile** on the preview's `/` and `/store` (production-like: CDN-cached registry, Brotli, HTTP/2) and compare with §2 – my local runs did not reach 2.5 s on Home.
4. The session log is committed in `ai-logs/` (converted from the transcript and redacted); run `/export` too if you prefer the full export.

## 4. Plain-language explanation
- **Faster clicks:** every link in the app is a `PrefetchLink`. When the mouse rests on a link for 80 ms, the keyboard reaches it, or a finger touches it, the app already asks for what that page shows and downloads its code. By the time the click lands the page is usually ready, so there is no loading state. It never asks twice within 30 s, never fetches orders when nobody is signed in, and does nothing early when the browser's data saver is on.
- **Smaller first download:** the cart, payment, orders and sign-in pages are separate files, loaded only when needed (or on hover). Home, Store and Product stay in the main file, because that is where people arrive.
- **Faster home page:** the server's block list now also names the hero picture, so the browser starts downloading it at once, and the hero shows it while its text is still loading. Mobile LCP went from 4.9 s to about 2.7 s locally.
- **No white screens:** if a page crashes, the frame stays and the page shows "Something went wrong" with Retry and Home. If the frame itself crashes, a simple full page does the same.
- **Screen readers and keyboard:** after every page change the focus moves to the new page's heading and the new title is announced, as in a normal website. Every page has its own title.
- **Swipe:** on phones the hero carousel follows a sideways swipe; scrolling up and down still works.

## 5. Deviations from the task and why
- **Route `lazy` instead of `React.lazy`** (the task allows both). I first built it with `React.lazy` + `Suspense`, but React keeps a Suspense fallback on screen for at least 300 ms (`FALLBACK_THROTTLE_MS`), even when the chunk is already there. Route `lazy` shows the layout at once with the skeleton in the page area (`HydrateFallback`), keeps the old page during a click navigation, and sends a failed download to the error page.
- **The LCP target is not reliably met locally** (Home 2.68 s, Store 2.48–2.58 s; CLS met) – see §2 for what is left and the conditions. The changes that would cut further (server rendering, a static app shell in `index.html` duplicating the banner and header, dropping React Router / TanStack) change the architecture and were not made.
- **`/` → the home registry is in the prefetch plan.** The task lists product / store / orders; the home page's own data is the registry, and the same plan is used by `main.tsx` to start the opened page's request before the first render.
- **Product and order tab titles changed** ("{game} ({platform} · {region})", "Order #…", "Payment for order #…"): needed for "every page has a unique document title".
- **Hero `sizes` kept** (`70vw` above 930 px), backed by measurements (§2); the value is now shared with the preload.
- **The search box's ↓/↑ prefetch is not a PrefetchLink event:** the active row never gets focus (ARIA combobox), so `SearchBox` calls the same `prefetchRoute`.
- **DESIGN.md `lang` line corrected** (`en`, as in `index.html`) – a pre-existing documentation error found during this pass.

## 6. Open questions
- Should the README embed some of `docs/screenshots/` now, or in the planned README task?
- Is the remaining Home LCP (~2.7 s locally) acceptable, or should a later task look at heavier options (a prerendered shell)?

### Parity pass – what intentionally differs from eneba.com
- **Home:** Eneba's phone banner is a row of four portrait promo cards; ours is the 16:9 carousel + tiles (Task 15 decision). Not copied or no such feature: promo art, the "Black Friday" countdown popup, the cookie and location popups, wishlist hearts, the language / currency switcher, cashback, gift-card rows.
- **Store and search:** "108 results" vs "Results found: 1000+"; our filters are platform / region / price (our data model), where Eneba has country / product type; Eneba's search keeps the generic store title as `h1`, ours says "Results for '…'".
- **404:** Eneba shows a large left-aligned "Highscore! 404" over a game-themed illustration (not copied); ours keeps the shared empty-state block and now has the same **outlined button** ("Back to the home page").
- **Skip link and page-change focus:** Eneba has no skip link; ours is an accessibility requirement.
- **Error page, page skeleton:** no Eneba equivalent seen.
- **Cart, payment, orders, sign-in:** compared in Tasks 14 / 16b (measured in DESIGN.md 3.6); no new differences found.

## 7. Self-review (task-reviewer)
Run after all code was committed (branch at 750797f), given only the task number. **Verdict: CHANGES NEEDED** – only for deliverables that did not exist yet at that point.

| Reviewer finding | What was done |
|---|---|
| 1a–1f PrefetchLink (every internal link, 80 ms hover / focus / touchstart, data per target, chunk, staleTime + saveData, old prefetch replaced, tests) | done – no change |
| 2 lazy routes with skeleton fallback | done – no change |
| 2b bundle sizes before/after only in the Lithuanian notes | **Fixed:** bundle table in §2 |
| 3a performance fixes | done – no change |
| 3b Lighthouse table with conditions missing; Home above 2.5 s must be said plainly | **Fixed:** §2 table, conditions, step-by-step Home table; §2 and §5 state that LCP < 2.5 s is not reliably met locally |
| 4 error boundary, 5 focus / skip link / titles, 6a screenshots, 7 docs, 8 swipe, 9 hero chain | done – no change |
| 6b list of what differs from eneba.com belongs in the report | **Fixed:** "Parity pass" list in §6 |
| 10 axe and manual-check results | **Fixed:** §2 (axe 0 in 22 runs; manual checks table) |
| 11 report and session log missing | **Fixed:** this report; the session log is committed on this branch |
| No scope creep, no CLAUDE.md violations; `100vh` / `40%` literals in two CSS files are viewport/relative units already used elsewhere | no change |
| Lithuanian notes quote numbers (4.9 → ~2.7 s, 2.64 vs 2.48 s, 469 → 450 kB, "4 of 6") that the report must back | **Backed:** the same numbers with their runs and conditions are in §2 |
| `.vscode/` is untracked and must not be committed | not committed |

After the review one more test was added (`errorPages.test.tsx`: a page chunk that cannot be downloaded shows the error page; commit 086c747).
