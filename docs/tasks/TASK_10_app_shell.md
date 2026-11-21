# Task 10 – App shell: routing, data layer, header, demo banner, footer, base components

**Model:** Sonnet · **Effort:** high
Runs in parallel with Task 10b (backend only) – that one works in a separate git worktree.

## Goal
Replace the health page with the real application frame that every later screen lives in. Pages themselves are placeholders here (Store = Task 11, Product = Task 12, …).

## Decisions (made by the owner – do not change)
1. **Routing:** React Router (library mode, `createBrowserRouter` + one layout route with `<Outlet/>`).
2. **Data:** TanStack Query. One `QueryClient` with sensible defaults (explain each: `staleTime`, `retry`, `refetchOnWindowFocus`). All server calls still go through `src/api/client.ts` (`apiFetch`) – TanStack Query calls those functions, never `fetch` directly.
3. **Icons:** `lucide-react` (import only the icons used).
4. **Routes:** `/` (home), `/store`, `/product/:slug`, `/cart`, `/login`, `/register`, `/orders`, and a 404 page for anything else. All except 404 are placeholders now (title + one line "coming in a later task"), rendered inside the shared layout.
5. **URL is the source of truth for Store filters** (`/store?platform=steam&sort=price_asc&page=2`). Add a small typed helper now (`useStoreParams` or similar: read/write the listing params from/to the URL with `useSearchParams`, reusing `buildProductsQuery` rules from `src/api/catalog.ts`), with Vitest tests. Task 11 builds the page on top of it.
6. **Header** (per `docs/DESIGN.md` §3.1):
   - left: text wordmark **EneHomeworkBa** (link to `/`), no logo image;
   - center: search field; submitting navigates to `/store?q=<text>` (real typo-tolerant search comes later; empty submit does nothing);
   - right: cart icon with a count badge (shows 0 for now, reads from a tiny `useCartCount()` stub that the cart task will replace) and a "Sign in" link to `/login`;
   - mobile (< 600 px, see breakpoints): wordmark + icons in the first row, the search field as a full-width second row.
   - Keyboard: `/` focuses the search field (unless typing in another input).
7. **Demo banner** above the header, always visible, **not dismissible**, calm colors (not red/alert), text exactly:
   *"Internship demo – not affiliated with Eneba. Sign-in and checkout are simulated."*
8. **Footer** (per §3.5): "Game data and cover art provided by IGDB" (link to igdb.com), a one-line non-affiliation note, and a link to the GitHub repo.
9. **English UI.** Money formatting helper `formatPrice(cents)` → `€12.99` (`Intl.NumberFormat`, EUR), with Vitest tests (0, 5, 1199, 100000, null → "—").
10. **Global "Waking up the server…"** indicator: if any API request has been pending for > 1.5 s, show a small non-blocking notice (e.g. top-right or under the header) until requests finish. Reuse the logic idea from `useApi`; implement it for TanStack Query (e.g. via `useIsFetching` + a timer). After this, remove `useApi` and its test if nothing uses it any more (keep `apiFetch` and its tests).
11. **Document title per page**, e.g. "Store – EneHomeworkBa"; home = "EneHomeworkBa – internship demo".

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/10-app-shell`).

## 2. Base components (CSS Modules + tokens only, per `docs/DESIGN.md` §4)
`Button` (primary/secondary/ghost, disabled, loading), `SearchField`, `Badge`, `Price` (uses `formatPrice`, optional old price + discount), `Skeleton`, `EmptyState`, `ErrorState` (message + Retry button). Put them in `src/components/`. No component library. Each has visible focus styles.
The health check is no longer a page: keep `/api/health` on the backend, but the UI does not need to show it.

## 3. Structure
Suggested: `src/app/` (router, layout, query client), `src/components/`, `src/pages/`, `src/lib/` (formatPrice, url params). Explain the structure in the report.

## 4. Verify
- Standard checks from `CLAUDE.md` (lint, Vitest, build, Go checks unaffected).
- Screenshots (desktop + mobile width) of: home placeholder with banner/header/footer, 404 page. Describe them in the report.
- Manual: search submit → `/store?q=…`; browser back works; unknown URL → 404 page inside the layout (and a hard reload of `/store` on the Preview still works – the SPA fallback in `vercel.json`).
- Lighthouse/axe quick check of the layout for contrast and labels (report the result, fix obvious issues).

## 5. Docs
`docs/PAAISKINIMAI_LT.md`: React Router layout route + `<Outlet/>`; why TanStack Query (cache, `staleTime`, no flicker) and what each default means; why the URL holds the Store filters; how the global "waking up" notice works; why the banner is not dismissible (phishing-risk reasoning from the research).

## Report
As defined in `CLAUDE.md` (incl. section 7 Self-review). Export the session log at the end and commit it on this branch.
