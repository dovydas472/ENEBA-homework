# Task 17 – Polish: instant navigation, performance, resilience, final parity pass

**Model:** Opus · **Effort:** high
Start after Task 15 (homepage) is merged. No migration.

## Goal
The app should feel instant and never show a blank or broken screen. Finish with one consistent pass over every page.

## Decisions (made by the owner – do not change)
1. **`PrefetchLink`** – one shared link component used for **every internal link** (header, nav, platform row, tiles, "View all", product cards, "Other versions", breadcrumbs, orders, footer internal links):
   - prefetch on **hover after ~80 ms** (cancel if the pointer leaves earlier), on **focus**, and on **touchstart** (phones have no hover);
   - prefetches the **data** the target page needs through the existing TanStack queries: `/product/:slug` → product query; `/store?…` → listing query with the parsed params (same sanitizer as the Store page); `/orders` → orders query only when signed in; unknown targets → nothing;
   - also prefetches the target route's **code chunk** (see 2);
   - never prefetches the same thing twice within `staleTime`; respects `navigator.connection.saveData` (no prefetch then).
   Replace the existing ad-hoc card/suggestion prefetch with it where it fits (keep behaviour). Tests.
2. **Route code splitting:** keep Home, Store and Product in the main bundle; lazy-load cart, checkout/payment, orders, order detail, login, register (`React.lazy` / route `lazy`) with a skeleton fallback. Report bundle sizes before/after.
3. **Performance pass** (Lighthouse **mobile**, production build, on Home, Store, a Product page): report LCP, CLS, TBT before/after and fix the top issues, e.g. `preconnect` to `images.igdb.com`, preload the two Metropolis weights used above the fold, `font-display: swap`, correct `sizes`/`srcset`, no layout shifts. Target: CLS < 0.1, LCP < 2.5 s on Home and Store (state the measuring conditions).
4. **Resilience:** a route-level **error boundary** (`errorElement`) with a friendly page ("Something went wrong" + Retry + Home) – a render error must never white-screen the app; the global "Waking up the server…" notice still works.
5. **SPA accessibility:** on route change move focus to the page's `h1` (or a skip target) and announce the new page title; a visible **"Skip to content"** link. Every page has a unique document title.
6. **Final parity pass:** screenshots of every page at 1440 and 390 (home, store, store with search, product, cart, payment, order, orders, login, register, 404) – compare with eneba.com where an equivalent exists, fix small leftovers, list what intentionally differs. Save a clean set of **our** screenshots to `docs/screenshots/` (they will be used in the README).

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/17-polish`).

## 2. Verify
Standard checks; Lighthouse numbers table (before/after); bundle table; axe 0 on all pages; manual: hover a product card → Network shows the product request before the click; on a phone-size touch emulation, touchstart prefetches; throw a test error in a dev-only route/component to see the error page (do not leave it in production code).

## 3. Docs
`docs/PAAISKINIMAI_LT.md`: prefetch on intent (hover delay, touchstart, saveData); code splitting and why only some routes; LCP/CLS and what was fixed; error boundary; focus management in an SPA.

## Report
As defined in `CLAUDE.md` (incl. Self-review). Export the session log at the end and commit it on this branch.

Addendum to Task 17:
- Swipe gesture for the home carousel on touch devices (pointer events, no new dependency; horizontal threshold, does not block vertical scrolling).
- Mobile LCP is 5.0 s because the hero image URL arrives only after bundle → /api/homepage → /api/blocks/hero. Shorten that chain without hardcoding content in the frontend: e.g. /api/homepage may include a small server-provided "preload" hint (the first hero slide's image srcset) that the app turns into an early <link rel="preload" as="image" imagesrcset=…>, and/or start the hero block request in parallel. Measure before/after.
