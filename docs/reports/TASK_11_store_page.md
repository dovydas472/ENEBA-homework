# Report – Task 11: Store page (catalog with filters, sort, pagination)

Task file: [`../tasks/TASK_11_store_page.md`](../tasks/TASK_11_store_page.md), plus the owner's change in [`../tasks/TASK_11_amendment_price_slider.md`](../tasks/TASK_11_amendment_price_slider.md) (S4: dual-thumb price slider + the two € boxes)
Branch: `task/11-store-page` (from `main` at `02a11c8`, after the merge of PR #9 / Task 10)

## 1. Files changed
**New – `src/features/store/`** (one component = one `.tsx` + one `.module.css`, tokens only)
- `ProductCard` (+ `ProductCardSkeleton`), `CoverImage`, `ProductGrid` (+ `ProductGridSkeleton`): the grid, the card, the cover with fallback.
- `FilterPanel` (the three groups, used by both the sidebar and the drawer), `FilterSidebar`, `FilterDrawer` (native `<dialog>`), `FilterGroup` (foldable group), `CheckboxFilter`.
- `PriceFilter` (draft state, commit rules), `PriceSlider` (two native range inputs over one track), `price.ts` (pure: euros ↔ cents, slider bounds, thumbs cannot cross, validation).
- `ActiveFilters` (chips + "Clear all"), `SortSelect` (native select, S9 labels), `Pagination` + `pageList.ts` (pure: which numbers to show).
- Tests: `price.test.ts`, `pageList.test.ts`, `Pagination.test.tsx`, `PriceFilter.test.tsx`, `ProductCard.test.tsx`; `fixtures.ts` (test data).
- `src/pages/StorePage.tsx` + `.module.css` (replaces the placeholder), `src/pages/StorePage.test.tsx` (32 tests, mocked `apiFetch`).
- `src/api/queries.ts`: query keys + `productListQuery` / `productQuery` in ONE place (shared by the page and the hover prefetch).
- `src/components/Spinner.tsx` (+ css), small additions to existing components (see Changed).
- `docs/tasks/TASK_11_store_page.md` and `TASK_11_amendment_price_slider.md` (verbatim), this report, `docs/reports/assets/task11_*.png` (14 screenshots).

**Changed**
- `src/lib/storeParams.ts` (+ tests): the S12 sanitizing now also covers everything the API answers 400 for: min > max (both dropped), `page` > 10000, repeated slugs, more than 20 slugs. Limits are exported constants that mirror `pkg/server/catalog_query.go`.
- `src/lib/useStoreParams.ts` (+ test): every write passes `preventScrollReset: true` (see §4, "ScrollRestoration").
- `src/app/Layout.tsx`: `<ScrollRestoration />` (S11).
- `src/components/Badge` (new `text` variant = mint uppercase text, DESIGN 4.5), `Price` (new optional `label`, the "From" line, DESIGN 4.4), `Button.module.css` (`.label` is now `inline-flex`, so an icon beside the text sits on one line – before, the button's label span had no style).
- `src/styles/tokens.css` + `docs/DESIGN.md`: 7 new tokens (`--opacity-dimmed`, `--cover-aspect-ratio`, `--checkbox-size`, `--price-input-width`, `--slider-thumb-size`, `--slider-thumb-hit`, `--slider-track-height`) and an "As built" note in 3.2, 4.3, 4.6, 4.8.
- `src/test-utils.tsx`: `rerender`, `setControlValue`, `fire`, `pressKey` helpers.
- `docs/PAAISKINIMAI_LT.md` (10 new sections: query keys + prefetch, `keepPreviousData`, filters in the URL, sanitizing vs. server 400, price filter/slider, focus trap, cover fallback, `ScrollRestoration`, pagination, accessibility), `README.md` (layout list).

No migration, no Go change, no new dependency (`package.json`, `package-lock.json`, `go.mod`, `go.sum` unchanged).

## 2. Verification results
| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...`, `go test ./...` | pass |
| `npm run lint` | pass (no rule disabled) |
| `npm test` (PowerShell) | **213 tests in 18 files pass**, 3 runs in a row (the page tests wait for TanStack Query's timer, one flaky run was fixed by waiting a few ticks) |
| `npm run build` | pass (JS 389 kB / 125 kB gzip, CSS 27 kB) |

**Real browser** (headless Edge driven by `puppeteer-core`, against `vite preview` of the production build and `go run ./cmd/local` on the Neon **dev** branch; scripts and `axe-core` live in the session scratchpad, nothing was added to the repo):
- **axe-core** (WCAG 2 A/AA, 2.1 AA, best practice, incl. colour contrast): **0 violations** on `/store` desktop 1440 and mobile 390 (drawer closed AND open), `platform=psn&sort=price_asc` (chips), the 0-results page and page 2. The first run found one real problem: the out-of-stock card at `opacity: .7` made the mint platform text 4.0:1; `--opacity-dimmed` is now `.8` (5.0:1) – computed with the contrast formula, then re-run.
- **No flicker:** with the API slowed by 400 ms, a filter change never showed fewer than 24 cards (sampled every frame); the old grid stayed, dimmed and `aria-busy`.
- **Layout shift while covers load:** CLS 0.0001 (load + scroll through all lazy covers; "good" is < 0.1).
- **`ScrollRestoration`:** scrolled to 900 px, opened a product, Back → scrollY 900 again, same URL. A checkbox or sort change at scrollY 500 does not jump to the top (it stays at ≈ 500; the small difference is the chips row appearing); a page-2 click puts the results bar at the top of the viewport.
- **Price slider:** dragging the max thumb: the box follows live, **0 requests during the drag, 1 after release** (`?maxPrice=2000`). Keyboard: 2 × ArrowRight on the min thumb = 2 requests, focus stays on the thumb, `aria-valuetext` "€6.00". Typed min > max: the message appears, **0 requests**. On a phone viewport the thumb's tap target measures 40 × 40 px.
- **Drawer:** 40 Tab presses: 39 stop inside the dialog, 1 is the browser's own UI (focus on `body` = it left the page); Esc closes it and focus returns to the "Filters" button.
- **Hover prefetch:** hovering a card requests `/api/products/<slug>` once; hovering it again (cache fresh) requests nothing.
- **Image fallback:** with the cover host blocked, every loaded card shows the gradient + title placeholder (no broken-image icon).
- **Hand-typed URL** `?sort=foo&minPrice=abc&page=0&maxPrice=700&platform=steam,,steam`: renders 5 cards, no error, request is `?platform=steam&maxPrice=700`.

**Screenshots** (`docs/reports/assets/`): `task11_store-desktop.png`, `task11_store-mobile.png`, `task11_drawer-mobile.png`, `task11_drawer-price-mobile.png` (slider with 40 px thumbs), `task11_psn-price-asc-desktop.png` / `-mobile.png`, `task11_no-results-desktop.png` / `-mobile.png`, `task11_page2-desktop.png` / `-mobile.png`, `task11_out-of-stock-desktop.png`, `task11_cover-fallback-desktop.png`, `task11_price-slider-desktop.png`, `task11_price-error-desktop.png`.

## 3. What I must do manually
1. Open the **Vercel Preview**: `/store` loads with covers; tick a platform (URL changes, results update); drag the price thumbs; open a product, press Back (same scroll position).
2. **Try the slider with a real finger on a phone** – I only tested touch emulation in headless Edge. Also open the drawer on the phone, press Esc on a laptop keyboard.
3. Run `/export` and save the session log as `ai-logs/2026-11-21_NN_store-page.md`; commit it on this branch.
4. Optional: Lighthouse in Chrome DevTools on the Preview `/store` (axe already reports 0 violations).

## 4. Plain-language explanation
**What it is.** `/store` now shows the catalog. Everything the user chooses (platforms, regions, price, sort, page) is written into the address bar; the page reads the address bar, asks the API for exactly that, and draws the answer. Reload, Back, and a pasted link all show the same thing because there is no second copy of the filters in React.

**Why it feels smooth.**
- *No flicker:* when a filter changes, TanStack Query would normally have "no data yet" for the new filters and the page would flash skeletons. `keepPreviousData` keeps the previous answer on screen (a little dimmed, with a spinner) until the new one arrives.
- *No layout jump:* every cover sits in a box with a fixed 5:7 ratio, so the page has its final height before any image arrives. If an image is missing or fails, a generated cover (the title on a purple gradient) fills the same box.
- *Instant product page:* hovering a card already requests that product's data; by the click it is usually cached.

**Why the URL is cleaned.** Anyone can type `?sort=foo` or `?minPrice=abc`. The page throws such values away before asking the API, so nobody sees a 400 page. The API still checks everything itself, because anyone can call it without our page.

**The price filter.** Two native range inputs lie over one track (no library). Their numbers and the two boxes are the same draft. While you drag, the boxes change live but nothing is requested; when you let go (or press Enter / leave a box) the URL changes once. The URL holds **cents** (integers); the boxes show euros. Thumbs cannot cross; a thumb at the end of the slider means "no limit". Min > max shows a message and sends nothing.

**The mobile drawer** is a native `<dialog>` opened with `showModal()`. The browser makes the rest of the page unreachable (focus trap), closes it on Esc and puts focus back on the "Filters" button – three things that are easy to get wrong by hand and that matter for keyboard and screen-reader users.

**`ScrollRestoration`.** Back from a product returns to the same place. Because it would also scroll to the top when only the filter in the URL changes, every filter/sort/price write passes `preventScrollReset`; changing the page scrolls to the results bar by itself.

## 5. Deviations from the task and why
- **S4 price boxes are text inputs** (`inputmode="decimal"`), not `type="number"`. A number input returns `""` for typed garbage, so "invalid input" could not be reported, and many browsers reject the decimal comma. The look is the same (4.2, 77 px, no spin buttons).
- **Desktop grid is 4 columns, never 5** (S7 says "4–5"). With the 1200 px container and the 220 px sidebar there is room for 4 cards of ≈ 223 px. Columns: 4 above 1200 px, 3 from 601 to 1200 px, 2 on phones; only the three DESIGN breakpoints are used (DESIGN.md 3.2 mentions 1100 px, which is not one of the allowed numbers).
- **Phones get vertical cards in 2 columns** (S7), not the horizontal list card of DESIGN.md 4.3 / 3.2. DESIGN.md now says so ("As built").
- **Out-of-stock dim is `.8`, not DESIGN.md's `.5`** (and not my first `.7`): see the axe finding in §2. New token `--opacity-dimmed`, also used for the dimmed grid while loading.
- **No sticky sidebar and no "N more" toggle** (8 platforms at most). The groups can be folded (DESIGN.md 4.8).
- **Coincident thumbs:** when both thumbs sit on the same spot, the one that can still move away from the other is on top (min in the upper half of the range, max in the lower half). I did not add "click the track to move the nearest thumb".
- **Hover/focus on the card** is a shadow + accent title; the "Add to cart" / "View offers" buttons of DESIGN.md 4.3 are not built (no cart yet; the whole card is the link, S6).
- **The amendment is stored as a separate file** (`TASK_11_amendment_price_slider.md`), like Task 09's amendment, so the task file stays verbatim.
- **Small changes in shared components** (`Badge`, `Price`, `Button.module.css`, `test-utils`) were needed for the card and the icon buttons; they are additive.

## 6. Open questions
All three questions of the first version of this report were answered by the owner; no change to the code:
1. The chips row pushing the grid down by ≈ 35 px when the first filter is applied: **keep as is** (a shift caused by the user's own action; CLS ignores shifts right after user input).
2. "Clear all" / "Clear filters" keep the sort and the search text `q`: **correct, keep**.
3. 4 columns on desktop (never 5): **fine, keep**.

No open questions remain.

## 7. Self-review (output of the `task-reviewer` subagent)
The reviewer ran when the report and the AI log did not exist yet (given only "Task 11"). Verdict: **CHANGES NEEDED**, but it found no requirement missing (S1–S13, the slider amendment, tests, LT docs all "done") and no hard CLAUDE.md violation.

| Finding | What I did |
|---|---|
| Report with section 7 and the AI log are missing | Expected at that point. The report is this file; its §2 now holds the evidence for the numbers quoted in `PAAISKINIMAI_LT.md` (axe 0 violations, CLS 0.0001, scroll 900 → 900, ≥ 24 cards in every sampled frame, 39/40 Tab stops inside the drawer). The AI log is the owner's `/export` (§3, item 3). |
| `PriceSlider.module.css:8` has a literal `opacity: 0.5` | **Kept, justified.** DESIGN.md §4 defines "Disabled: `opacity: .5`" as a literal, and `Button.module.css` already uses the same literal for its disabled state. A token only for the slider would be inconsistent, and converting Button is outside this task. The line has a comment pointing to DESIGN.md. |
| Scope creep: foldable filter groups, "That page does not exist" state, `Spinner`, `Price.label`, `Badge` text variant, `Button` label wrapper, README line | **Kept.** Foldable groups are in DESIGN.md 4.8 (header with chevron). The out-of-range page is a real case (an old bookmark gives an empty list with `total > 0`), costs ~10 lines, and is tested. The component additions are needed by the card and the icon buttons and are additive. README line is the existing layout list. |
| No direct unit tests for `FilterDrawer`, `ActiveFilters`, `CheckboxFilter`, `SortSelect` (optional) | **Not added.** They are exercised through `StorePage.test.tsx` (drawer: open/close/Esc/instant filters; chips: remove one, Clear all; checkboxes; sort labels and URL). |
| Untracked `.vscode/` | Not committed. |
| Golden hash / migrations do not apply | Correct: no Go, schema, seed or workflow change. |
