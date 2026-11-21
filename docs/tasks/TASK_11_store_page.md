# Task 11 – Store page (catalog with filters, sort, pagination)

**Model:** Sonnet · **Effort:** high

## Goal
The real `/store` page on top of `GET /api/products` (Task 09) and `useStoreParams` (Task 10), styled per `docs/DESIGN.md` (§3.2 Store page, §4.3 Product card, §4.4 Price, §4.5 Badge, §4.6 Select, §4.8 Filter group, §4.9 Empty/Error, §4.10 Skeleton).

## Decisions (made by the owner – do not change)
**Layout**
- S1. Desktop: filter sidebar on the left (Platform, Region, Price); above the results a bar with the result count ("108 results"), active-filter chips (each with ×) + "Clear all", and the sort select.
- S2. Filters apply **instantly** (each change updates the URL → new query). Price inputs apply on Enter/blur, not on every keystroke. Any filter or sort change resets `page` to 1.
- S3. Mobile (< 930 px, see breakpoints): a "Filters (n)" button opens a full-screen drawer with the same filter groups; changes apply instantly and the drawer has a "Show N results" button that closes it. Focus is trapped in the drawer, Esc closes it, focus returns to the button.
- S4. Price filter: two number inputs in € ("Min", "Max"), placeholders from `facets.priceRange`; converted to cents for the URL/API. Min > max → inline validation message, no request. No slider.
- S5. Pagination: numbered pages with Prev/Next (`1 2 3 … 5`), 24 per page, page in the URL; on page change scroll to the top of the results.
- S7. Grid: 2 columns on phones, 3 on tablets, 4–5 on desktop (use the `DESIGN.md` breakpoints/tokens).

**Product card** (S6, `DESIGN.md` §4.3)
- Whole card is one link to `/product/:slug`.
- Cover from `coverUrl` with `loading="lazy"`, fixed aspect ratio (no layout shift). If `coverUrl` is null **or the image fails to load**, show a generated placeholder (game title on a token-colored gradient) – no broken-image icon.
- Title; edition shown only if not "Standard"; platform + region as text badges.
- Price: "From €11.99" + MSRP struck through + discount badge "-60%" (only when `discountPercent` > 0). Out of stock: no price, an "Out of stock" label, card slightly dimmed.
- Hover/focus styles per tokens.

**States**
- S8. First load: skeleton cards. Filter/sort/page change: keep the previous results visible but dimmed with a small loading indicator (TanStack Query `placeholderData: keepPreviousData`) – no flicker, no layout jump. Error: `ErrorState` with Retry. No results: `EmptyState` "No products match these filters" + "Clear filters".
- Result count is announced to screen readers (`aria-live="polite"`).

**Other**
- S9. Sort labels: Most popular · Price: low to high · Price: high to low · Biggest discount · Newest · Name A–Z.
- S10. Text search is not implemented in the API yet: if the URL has `q`, show an info line *"Text search arrives in a later task – showing all products."* (will be removed by the search task). Do not send `q` to the API yet.
- S11. Enable React Router `ScrollRestoration`: Back from a product page returns to the same scroll position on the Store.
- S12. Invalid URL params typed by hand (e.g. `sort=foo`, `minPrice=abc`) are **sanitized on the client** (fall back to defaults / dropped) – the user never sees a 400 page. Keep the API's 400 as the server-side guard.
- S13. Prefetch the product page data on card hover/focus (`queryClient.prefetchQuery` with the product key), so opening a product feels instant. The product page itself is Task 12 – only the query key/function is shared now (put it in `src/api/` or a `queries.ts`).

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/11-store-page`).

## 2. Structure
`src/pages/StorePage.tsx` + feature components (e.g. `src/features/store/`: `FilterSidebar`, `FilterDrawer`, `PriceFilter`, `ActiveFilters`, `SortSelect`, `ProductGrid`, `ProductCard`, `CoverImage`, `Pagination`). Query keys in one place. No new dependencies (React Router, TanStack Query, lucide-react already exist).

## 3. Tests (Vitest)
- Pagination: page list with ellipses for first/middle/last pages, Prev/Next disabled at the edges.
- Price filter: € → cents, invalid input, min > max message.
- Param sanitizing (S12).
- `ProductCard`: out-of-stock rendering, edition hidden for "Standard", discount badge only when > 0, image fallback on `onError`.
- Store page with a mocked `apiFetch`: renders items + facet counts; clicking a platform updates the URL and resets page to 1; empty and error states.

## 4. Verify
- Standard checks from `CLAUDE.md`.
- Real browser against local API (`dev` DB): screenshots desktop + mobile (drawer open) of: default store, `platform=psn&sort=price_asc`, a filter combination with 0 results, page 2, an out-of-stock card. Check Back-navigation scroll restore and that changing filters does not flicker.
- axe: 0 violations on the store page (desktop + mobile, drawer open and closed).
- Performance: no layout shift when covers load (fixed aspect ratio).

## 5. Docs
`docs/PAAISKINIMAI_LT.md`: `keepPreviousData` and why no flicker; filters in the URL + page reset; client-side param sanitizing vs server 400; focus trap and why it matters; image fallback; prefetch on hover; `ScrollRestoration`.

## Report
As defined in `CLAUDE.md` (incl. Self-review). Export the session log at the end and commit it on this branch.
