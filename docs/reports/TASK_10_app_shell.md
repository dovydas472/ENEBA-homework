# Report – Task 10: App shell (routing, data layer, header, demo banner, footer, base components)

Task file: [`../tasks/TASK_10_app_shell.md`](../tasks/TASK_10_app_shell.md)
Branch: `task/10-app-shell` (from `main` at `cbbb33a`, after the merge of PR #7 / Task 09)

## 1. Files changed
**New**
- `src/app/` – the frame: `routes.ts` (route table, plain array so tests reuse it), `Layout.tsx` (+ `<Outlet/>`, skip link), `Header`, `DemoBanner`, `Footer`, `SlowServerNotice` (each with a `.module.css`), `RouteError.tsx` (error boundary), `queryClient.ts` (`createQueryClient`, `shouldRetry`), `useSlowRequests.ts`.
- `src/components/` – `Button`, `SearchField`, `Badge`, `Price`, `Skeleton`, `EmptyState`, `ErrorState`, `VisuallyHidden` (CSS Modules, tokens only).
- `src/pages/` – `HomePage`, `StorePage`, `ProductPage`, `CartPage`, `LoginPage`, `RegisterPage`, `OrdersPage`, `NotFoundPage`, shared `PlaceholderPage`.
- `src/lib/` – `formatPrice`, `storeParams` (pure: parse / build / merge), `useStoreParams` (hook), `pageTitle`, `useDocumentTitle`, `useCartCount` (stub), `useSlashShortcut`, `isTypingTarget`, `cx`, `appInfo` (name and links).
- `src/test-utils.tsx` – 15-line `render` helper (no Testing Library was added).
- Tests: `formatPrice`, `storeParams`, `useStoreParams`, `pageTitle`, `cx`, `isTypingTarget`, `queryClient`, `useSlowRequests`, `Button`, and `routes.test.tsx` (whole shell in an in-memory router) – 71 new Vitest tests.
- `docs/tasks/TASK_10_app_shell.md` (verbatim), this report, `docs/reports/assets/task10_*.png` (6 screenshots).

**Changed**
- `src/main.tsx` (`QueryClientProvider` + `RouterProvider`), `package.json` / `package-lock.json` (+ `react-router`, `@tanstack/react-query`, `lucide-react`, exactly the three the task names).
- `src/styles/tokens.css` and `docs/DESIGN.md` §2.1/§2.4: 9 new tokens, documented in the same PR – `--color-control-hover/-active`, `--search-height`, `--search-max-width`, `--icon-size`, `--icon-size-sm`, `--spinner-size`, `--badge-count-size`, `--toast-max-width`.
- `docs/PAAISKINIMAI_LT.md` (old `useApi`/`App` sections rewritten; new sections: layout route + Outlet, TanStack Query defaults, URL as source of truth, "waking up" notice, banner not dismissible, base components, `formatPrice` / `/` shortcut / titles / cart stub), `README.md` (layout list).

**Added after the owner's review answers:** `public/favicon.svg` (own "EH" monogram, `--color-bg` purple + `--color-accent` yellow, linked in `index.html`, noted in `DESIGN.md` §2.1); `vercel.json` `functions: { "api/index.go": { "maxDuration": 15 } }` (decided in Task 10b, it had not reached `main`) with one line in the timeout budget comment of `pkg/db/retry.go` and a sentence in `PAAISKINIMAI_LT.md`; `CLAUDE.md` and `.claude/agents/task-reviewer.md` now say "`apiFetch` + TanStack Query" instead of `useApi`; `main` (Task 10b) merged into the branch (no force-push).

**Removed:** `src/App.tsx` (health page), `src/api/useApi.ts`, `src/api/useApi.test.tsx` (nothing uses them any more; `apiFetch` and its tests are kept). No migration or workflow change; the only Go change is one comment line in `pkg/db/retry.go`; `go.mod` untouched (`go 1.25` still).

**Structure.** `src/app` holds what ties the app together (routes, layout, query client); `src/components` are reusable pieces with no data fetching; `src/pages` is one file per route; `src/lib` holds pure helpers and hooks that are not UI. Dependencies point one way: pages → components/lib; `app` wires everything.

## 2. Verification results
| Check | Result |
|---|---|
| `gofmt -l .`, `go build ./...`, `go vet ./...`, `go test ./...` | pass / prints nothing (no Go files touched) |
| `npm run lint` | pass (no rule disabled) |
| `npx tsc -b`, `npm run build` | pass (JS 359 kB, 115 kB gzip) |
| `npm test` (PowerShell, as CLAUDE.md requires) | **95 tests pass in 12 files** (was 24) |
| `npm ci --dry-run`; `npm view` | lockfile consistent; `react-router 8.5.2`, `lucide-react 1.77.0`, `@tanstack/react-query 5.108.2` are the real latest versions |
| Mutation check | broke the empty-submit guard and the banner text on purpose → exactly the 2 matching tests failed; reverted |

**Real browser** (headless Edge driven by `puppeteer-core` against `vite preview` of the production build; the script lives outside the repo, nothing added to `package.json`):
- Title of `/` = "EneHomeworkBa – internship demo"; `/` key focuses the search field and types nothing into it; typing `/` inside the field is a normal character.
- Empty Enter: URL unchanged. Typing "half life 2" + Enter → `/store?q=half%20life%202`, title "Store – EneHomeworkBa", the field keeps the text.
- Browser Back → `/`, Forward → `/store?q=…`; hard reload of `/store?q=…` renders the Store placeholder (SPA fallback; `vite preview` here, see §3 for the Vercel Preview).
- Cart / Sign-in links navigate; titles "Cart – …", "Sign in – …". No console errors besides `/favicon.ico` → 404 at that time; fixed afterwards by adding `public/favicon.svg` (rendered and checked).
- Mobile (390 px): wordmark + cart + sign-in icons in row 1 (40×40 hit areas), search 350×40 px in row 2, no horizontal scroll (`scrollWidth` 390).
- **axe-core 4.x** (WCAG 2 A/AA, 2.1 AA, best-practice, includes colour contrast) on `/`, `/store`, `/nope` × desktop 1440 and mobile 390: **0 violations** each. The first run found one (banner text not inside a landmark); fixed by making the banner an `<aside aria-label="Demo notice">`. This is axe, not full Lighthouse (no Lighthouse is installed here; the owner can run it in Chrome DevTools, §3).

**Screenshots** (`docs/reports/assets/`):
- `task10_home-desktop.png` – 1440 px: banner strip (deep purple, info icon, text centered), header with wordmark left, 550 px search field centered, cart icon with red "0" badge and "Sign in" at the right; "Home / Coming in a later task."; dark footer with IGDB credit, non-affiliation line and GitHub link.
- `task10_home-mobile.png` – 390 px: banner wraps to two balanced lines ("Sign-in" never split), wordmark + icons row, full-width search row, same footer stacked.
- `task10_404-desktop.png` / `task10_404-mobile.png` – "Page not found" block with a "Back to the home page" link, inside the full layout (banner, header, footer present).
- `task10_notice-desktop.png` / `task10_notice-mobile.png` – the "Waking up the server…" notice (bottom-right / full width on phones). **Forced on for the screenshot** (a temporary `|| true`, reverted – no API call exists yet that could be slow); the real trigger is covered by `useSlowRequests.test.tsx`.

## 3. What the owner must do manually
1. Open the Vercel Preview of this PR (it is behind Vercel auth, as in Task 09). Check: search → `/store?q=…`, Back works, `/nope` shows the 404 page inside the layout, **F5 on `/store` still works** (SPA fallback in `vercel.json`).
2. Optional: run Lighthouse (Chrome DevTools → Accessibility) on the Preview home page; axe already reports 0 violations.
3. Run `/export` for the session log (`ai-logs/`); I commit it on this branch.
4. Check on the Preview that the deployment accepted `maxDuration: 15` for `api/index.go` (the Vercel check on this PR is the proof) and that the new favicon shows in the tab.

## 4. Plain-language explanation
The old page only showed "API: ok". Now there is a real frame. **React Router** maps URLs to pages; one "layout route" draws banner + header + footer once and puts the current page where `<Outlet/>` is, so the frame never reloads. **TanStack Query** is the cache for server data: with `staleTime` 30 s a page you already visited shows instantly without a new request; `retry` asks again once only when that can help (network / 5xx, not 404 or timeout); `refetchOnWindowFocus` is off because refetching on every tab switch would only flicker. The **Store filters live in the URL** (`useStoreParams`), so links, reload and Back work and there is no second copy of the state. The **"waking up" notice** counts running requests and shows after 1.5 s of waiting (free-tier Vercel/Neon can need a few seconds). The **demo banner has no close button** on purpose: the site imitates a real brand, so everyone must always see it is a demo (phishing risk). Details for the interview are in `docs/PAAISKINIMAI_LT.md`.

## 5. Deviations from the task and why
- **"Always visible" banner = shown on every page, not sticky.** Confirmed by the owner (review answer 1): it stays in the flow.
- **Search placeholder is "Search games"**, without a "press / to focus" hint (it was truncated/noisy on phones). The shortcut still works.
- **Extras not in the task (small, all explained in the LT docs):** a "Skip to content" link; a `RouteError` error boundary (a crashing page shows a generic message inside the layout instead of React Router's default error screen); `VisuallyHidden`, `cx`, `isTypingTarget`, `appInfo`, `test-utils` helpers; `resetParams` in `useStoreParams`; 9 tokens (allowed by CLAUDE.md, documented in `DESIGN.md`). No dependency beyond the three the task names.
- **Border widths are literal** (`1px`, the spinner's `2px`, the notice's `4px` type bar): `DESIGN.md` prescribes them as literal values (`1px solid …`, spinner `2px`, toast bar 4px) and has no border-width token; I did not invent one.
- **Header calls `useStoreParams()` on every page** only to prefill the search field with the current `?q=` (the field is uncontrolled; `key={q}` resets it). Cheap, and keeps the URL the single source of truth.
- **The "Sign in" link has `aria-label="Sign in"`** so it keeps its name on phones where only the icon is visible.
- axe-core instead of full Lighthouse (see §2).

## 6. Open questions
Answered by the owner in review and done: banner stays in the flow; own SVG favicon; `CLAUDE.md` / reviewer wording; `maxDuration: 15`. Still open:
1. Real typo-tolerant search (`q`) needs backend support; the URL already carries `q`, the API ignores it for now.
2. `ScrollRestoration` is not enabled (jsdom noise in tests, and Task 11/12 decide how the Store scroll should behave); with it, navigating from a scrolled Store to a product would start at the top.

## 7. Self-review (`task-reviewer` subagent)
Verdict of the review: **CHANGES NEEDED** (all 14 functional requirements "done"; the findings were documentation gaps and disclosure of extras).

| Finding | What I did |
|---|---|
| LT docs lacked sections for base components, `formatPrice`, the `/` shortcut, `useDocumentTitle`/`pageTitle`, the `useCartCount` stub | Added two sections to `docs/PAAISKINIMAI_LT.md` (ką daro / kodėl / ko gali paklausti). Fixed. |
| No test for the `Button` loading guard (click swallowing) | Added `Button.test.tsx` (5 tests: click, loading ignores clicks + `aria-busy`, stays focusable, disabled, default `type="button"`). Fixed. |
| Scope extras (skip link, route error boundary, helpers, tokens) | Disclosed in §5; kept – small, explained, no new dependency. |
| Literal `1px`/`2px`/`4px` vs "no hardcoded sizes" | Justified in §5 (DESIGN.md prescribes them; no border-width token exists). No change. |
| Banner not sticky vs "always visible" | Disclosed in §5; the owner confirmed it stays in the flow. |
| `CLAUDE.md:19` and `.claude/agents/task-reviewer.md:29` still mention `useApi` | Edited after the owner allowed it ("`apiFetch` + TanStack Query"). |
| `Header` calls `useStoreParams()` on every page | Explained in §5. |
| Versions `react-router 8` / `lucide-react 1` look unusual; which shell | Verified with `npm view` and `npm ci --dry-run` (§2); tests were run from PowerShell. |
| Mobile layout "no screenshot yet" (at review time) | Screenshots exist now: `task10_*-mobile.png` (§2). |
