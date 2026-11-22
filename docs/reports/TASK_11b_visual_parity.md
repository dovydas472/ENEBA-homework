# Task 11b – Visual parity with eneba.com: report

Task file: [`docs/tasks/TASK_11b_visual_parity.md`](../tasks/TASK_11b_visual_parity.md) · Branch: `task/11b-visual-parity`

## 1. Files changed

**New**
- `src/app/navLinks.ts` (+ `navLinks.test.ts`) – the one list of main links (Store + Steam, PSN, Xbox Live, Nintendo eShop), used by the nav strip, the phone menu and the footer.
- `src/app/MenuDrawer.tsx` / `.module.css` – the phone ☰ menu (native `<dialog>`).
- `src/lib/useModalDialog.ts` – keeps a `<dialog>` in sync with React state (was inline in `FilterDrawer`; now shared with the menu).
- `src/features/store/SortRadios.tsx` / `.module.css` / `.test.tsx` – the sort as radios inside the drawer.
- `src/features/store/sortLabels.ts` – sort labels shared by the select and the radios.
- `docs/reports/assets/task11b_before-*.png`, `task11b_after-*.png` – our screenshots (1440×900 and 390×844).

**Changed**
- Header: `src/app/Header.tsx` / `.module.css` (Eneba layout, nav strip, phone row with ☰ + search icon, no badge for an empty cart), `src/components/SearchField.module.css` (desktop size from 931px).
- Footer: `src/app/Footer.tsx` / `.module.css` (columns + legal line).
- Layout / Home: `src/app/Layout.module.css` (content 20px under the header), `src/pages/HomePage.tsx`, `src/pages/PlaceholderPage.tsx` / `.module.css` ("Browse the store").
- `src/components/Button.tsx` / `.module.css` / `.test.tsx` – new `ButtonLink` (a router link with the button look).
- `src/components/Price.tsx` / `.module.css` – "From €29.99 -60%" on one line; 20px price on the phone card.
- Store: `src/pages/StorePage.tsx` / `.module.css` / `.test.tsx`, `src/features/store/` – `ProductCard`, `ProductGrid`, `FilterGroup`, `FilterPanel`, `CheckboxFilter`, `ActiveFilters`, `SortSelect`, `FilterDrawer`, `Pagination` (+ test), `CoverImage` (comment).
- `src/styles/tokens.css` – new tokens, `--grid-gap` and `--cover-aspect-ratio` changed (see DESIGN.md 2.4).
- `src/test-utils.tsx` – `polyfillDialog()` shared by the Store and header tests.
- Docs: `docs/DESIGN.md`, `docs/PAAISKINIMAI_LT.md`, `CLAUDE.md` (new UI rule, task §5).

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...`, `go test ./...` | pass (no Go code changed) |
| `npm run lint` | 0 problems |
| `npm test` (PowerShell) | 20 files, **238 tests passed** (new: nav links, sort radios, ButtonLink, phone menu, phone search, drawer sort + backdrop click, filter group order + count badge) |
| `npm run build` | pass |
| **axe-core** (WCAG 2 A/AA, 2.1 AA, best practice), headless Edge | **0 violations** on `/`, `/store`, `/store?platform=psn` at 1440 and 390, the drawer open and the ☰ menu open |
| **CLS** (production build, `vite preview`, layout-shift observer) | `/` 0.0002, `/store` 0.0001, `/store?platform=psn` 0.0001 (desktop); 0.0000 on all three (phone). Limit 0.1 |
| Horizontal overflow, widths 360 / 600 / 601 / 768 / 930 / 931 / 1024 / 1200 / 1440 | none (the first run found 7px at 360px in the phone header → icons 40px wide, fixed) |
| Keyboard | drawer opens with focus on its close button, Esc returns focus to the pill; ☰ menu: wordmark → close → links; phone search: Esc closes and returns focus to the icon. Focus rings of the edge-flush close buttons were cut off → drawn inside the button now (fixed, re-checked) |

**How the reference was captured.** Same headless-Edge setup as Task 11 (`puppeteer-core` + `axe-core` in the session scratchpad, nothing added to the repo), against eneba.com (not blocked), at 1440×900 and 390×844:
home (header), `/store/all`, `/store/all?drms[]=steam` (platform filter), the phone "Sort and filter" drawer, the phone ☰ menu, the footer and a hovered card. Besides screenshots,
the script read computed styles and rectangles of the real elements, so the numbers below are measured. Eneba's cookie / location pop-ups were removed from the DOM before the
screenshots (no consent given). **Reference screenshots are stored outside the repo** (scratchpad); only our own screenshots are committed.

Our screenshots: before `docs/reports/assets/task11b_before-{home,store,psn}-{desktop,mobile}.png`, `task11b_before-drawer-mobile.png`;
after `task11b_after-{home,store,psn}-{desktop,mobile}.png`, `task11b_after-drawer-mobile.png`, `task11b_after-menu-mobile.png`, `task11b_after-card-hover-desktop.png`.

### Comparison per area (difference found → what was changed → still different, why)

**Header – desktop**

| Difference found (Eneba S4 vs ours before) | Changed | Still different (why) |
|---|---|---|
| Search right after the logo (20px gap), ours centred | flex row: wordmark, 20px, search (max 550px), actions pushed right | Our text wordmark is 233px wide, Eneba's logo 155px, so the search starts ~80px further right |
| Nav strip under the row (50px, full width, `rgba(0,0,0,.25)`, 16px medium `#dcd8e6`), ours had none | nav strip with Store + 4 platform links | Fewer items, no "Categories" / promo pill (no such pages) |
| Cart: no badge when empty; ours showed "0" | badge only when count > 0 | – |
| Cart 44×57, "Log in \| Register" 14px | cart 44px, "Sign in" 14px medium | Text "Sign in" (one auth page); no wishlist heart, no locale switch |

**Header – phone**

| Difference found | Changed | Still different (why) |
|---|---|---|
| One 56px row ☰ · logo · search · ♡ · cart · account, 1px `#1f0a4d` bottom line; ours had 2 rows (search always visible) | same single row; search icon opens the field over the row (× / Esc close); ☰ opens a full-screen menu | No ♡; icons 40px wide (Eneba 44) so the row fits 360px phones; wordmark is text 20px |
| ☰ menu: full screen, page colour, 16px regular links, 10px 20px padding | `MenuDrawer` the same | Only our 5 working links; no locale row, no app-store badges |

**Demo banner placement** – Eneba has none. Kept as is above the header on every page (owner rule: phishing-risk mitigation). The full-screen menu and the drawer cover it while open.

**Page background / containers**

| Difference found | Changed | Still different |
|---|---|---|
| Content starts 20px under the header, h1 margin `10px 0 30px`; ours 10px and `10px 0 10px` + 15px gaps | main padding-top 20px; h1 margin `10 0 30` | Title text is "Store" (Eneba's long SEO title is their content) |
| Sidebar 220 + 20 gap + 960 | already equal | – |

**Product card**

| Difference found | Changed | Still different (why) |
|---|---|---|
| Grid gap 20px (ours 22px), cover box 223×303 (ours 5:7 = 223×312) | `--grid-gap` 20px, `--cover-aspect-ratio` 223 / 303 | – |
| Platform on a 22px dark strip over the cover bottom; mint line = regions | strip with the platform name; mint line = region | Strip shows text only (Eneba: platform logo + text) – we copy no icons; text is uppercase full white (5.1: 10px only for uppercase labels; 85% white fails contrast) |
| "From €59.99 -67%" on one line, price below (ours: 3 lines) | `Price` puts label + old price + discount on one line, 3px apart | No ⓘ icon, no cashback line (no such data) |
| Hover: content slides up ~96px, reveals "Add to cart" + "View offers"; no shadow, title stays white (ours: shadow + yellow title) | slide-up by 50px revealing an outlined "View offers"; also on keyboard focus | No "Add to cart" (no cart yet); no wishlist heart on hover |
| Mint border on cards | none | Eneba draws it only on cashback cards; we have no cashback |
| Phone: 1 column of 348×132 list cards (70px cover left); ours 2 columns of vertical cards | list card, 1 column, 15px apart (owner decision) | No cart button / heart, so text uses the full width; no platform strip on the 70px cover (names don't fit as text) – platform is in the mint line; padding 10px (Eneba 8px, no token) |

**Filter sidebar**

| Difference found | Changed | Still different (why) |
|---|---|---|
| Groups separated by a 2px page-colour line (ours 1px white 25%) | `border-bottom: 2px solid var(--color-bg)` | – |
| Chevron points up when open (ours down) | `ChevronUp`, rotated when folded | – |
| Order starts with Price range | Price range, Platform, Region | Eneba has more groups (Country, Product type, OS, Genres…): no such data |
| Yellow count badge next to a group with ticked options | `selectedCount` badge (12px, our 10px rule) | – |
| Checkbox rows 25px, 10px apart (ours 21px, 15px apart) | same | – |
| Price range: two boxes, no slider | – | Our slider stays (Task 11 owner amendment) |

**Sort + result count bar**

| Difference found | Changed | Still different (why) |
|---|---|---|
| Count "Results found: N" white 14px bold-ish; ours muted | white 14px medium (desktop), muted 14px regular (phone) – like Eneba | Text "N results" (Task 11 owner decision) |
| Sort = text button: icon + "Popularity: Most popular" 16px bold + chevron; ours a boxed select with "Sort by" label | native select drawn as text button (icon, 16px bold, chevron, no box, `field-sizing: content`), label visually hidden | Opens the browser's native list, not Eneba's custom menu (keyboard / screen readers for free, DESIGN 4.6); our labels (S9) |

**Active-filter chips**

| Difference found | Changed | Still different (why) |
|---|---|---|
| Dark pills `#2c0e6c`, 30px, 14px, radius 15; row above the count, 30px gap; "Clear all" yellow 16px text (ours: outlined pills in the bar, ghost button) | same look and position; new tokens `--color-surface-chip`, `--chip-height` | Eneba's pill is one per group with a dropdown ("Platforms (1) ⌄"); ours is one per value with × (Task 11 S1) |

**Pagination**

| Difference found | Changed | Still different |
|---|---|---|
| Square 34×35 outlined arrow buttons, plain 16px bold numbers, current page yellow text (ours: "Prev"/"Next" text buttons, current = yellow box) | same; arrows named "Previous page" / "Next page" | Number tap area 35px (40px on phones) vs Eneba's text + padding |

**Phone filter drawer**

| Difference found | Changed | Still different |
|---|---|---|
| 300px panel from the left over a dimmed page; header "Sort and filter" + ×; sort radios inside; yellow "Show results (N)" footer; opened by a dark pill "Sort and filter (n)" next to the chips (ours: full screen, "Filters" outlined button, sort outside) | same (owner decision, replaces S3); slide-in; click on the dimmed page closes | Button text "Show N results" (Task 11 wording); our groups only |

**Footer**

| Difference found | Changed | Still different (why) |
|---|---|---|
| Columns with 14px bold headings and 12px `#dcd8e6` links, legal line 12px `#b3aac9`; ours 3 plain lines | "Shop" and "About" columns, legal line | 2 columns instead of 8; no social links, app badges, newsletter, locale button, Trustpilot strip (no such features / not our content) |

### Intentionally not copied
Eneba logo and name (wordmark stays **EneHomeworkBa**; "Eneba" appears only in the demo banner and the footer legal line) · all Eneba images, icons as files, illustrations, promo banners
and text content (SEO title and texts, "You may also be interested in", footer texts) · language/currency switch · wishlist heart (header, cards) · "Add to cart" on cards and
the phone card's cart button · cashback badge, cashback line and mint cashback border · price ⓘ · "Categories" menu item and category pages · "Cheap Games", "Software",
"Giveaway"… nav items and the promo pill · filter groups we have no data for (Country, Product type, OS, Genres) and in-group search · footer social links, app badges,
newsletter, Trustpilot strip.

## 3. What the owner must do manually
1. Open the PR Preview and compare with eneba.com yourself at a laptop size and on your phone (the CLAUDE.md rule now asks for this in every UI task).
2. On a real phone: ☰ menu, search icon, "Sort and filter" drawer (tap the dimmed area to close), the sideways-scrolling chips row.
3. On a laptop: hover a card (slide-up + "View offers"), Tab through a card (same slide on keyboard focus).
4. ~~Export the session log~~ – done: converted from the transcript (remote procedure, CLAUDE.md) to `ai-logs/2026-11-21_03_visual-parity.md` and committed on this branch.

## 4. Plain-language explanation
The app had Eneba's colours and font, but its layout was built from written notes. This task put the real site next to ours and measured it with a script
(sizes, spacing, colours of the actual elements), then changed our header, Store page, cards and footer to match, and checked again.
The header now has Eneba's structure: search right after the name, a dark strip of links underneath (Store and four platforms), and on phones a single row with a
menu button and a search icon. The Store page has Eneba's sidebar look, chips, sort control and pagination; on phones the cards are a one-column list and the filters
and sort live in a 300 px side panel, as on Eneba. A card slides up on hover to show "View offers". Everything Eneba shows for features we do not have was left out
instead of being faked. Accessibility stayed at 0 axe violations; one Eneba colour (the platform text on the cover strip) was too low in contrast, so we use pure white there.

## 5. Deviations from the task and why
- **Task 11 owner decisions replaced (asked first, owner chose Eneba's version on 2026-11-21):** S3 (full-screen drawer) → 300px side drawer with the sort inside;
  S7 phones (2 vertical columns) → 1 column of list cards; the card hover (shadow + yellow title) → slide-up with "View offers"; the phone header → ☰ menu + search icon.
- **Pagination arrows have no visible "Prev"/"Next" text** (S5 kept the structure; the look is Eneba's). Their accessible names are "Previous page" / "Next page".
- **Platform strip text:** full white and uppercase instead of Eneba's 85% white mixed case (contrast 3.95:1 → 4.74:1 worst case; 10px only for uppercase micro labels, DESIGN 5.2). The token `--color-text-on-overlay` was not needed in the end.
- **Search field on phones** was not captured open on Eneba (it is the input itself, it expands on focus); our open state (field + × over the header row) is our own design in the same place.
- The task says "Store reference screenshots outside the repo" – done; the reference is described in words above.

## 6. Open questions
Both answered by the owner on 2026-11-22 (PR review):
- ~~The demo banner is covered while the ☰ menu or the drawer is open.~~ **Owner: fine, keep** (it is visible again as soon as they close).
- ~~Eneba's chips are one per filter group with a dropdown; ours are one per value with ×.~~ **Owner: keep our per-value chips.**

## 7. Self-review (task-reviewer)
The `task-reviewer` subagent was given only the task number. Its summary (run after the code and docs were committed, before this report existed):

**Requirements:** branch + task file first commit, our before/after screenshots only (no Eneba images committed), header structure + working nav links only, "Store" entry point,
"Browse the store", every listed area compared and changed, no dead UI, tokens documented, no new dependencies, CLAUDE.md rule added – **done**.
Tests green / axe / CLS – **partly** (no evidence yet: "the report is missing"). Report and session log – **missing** (expected at that point).
**Scope creep:** none beyond justified items (token changes `--grid-gap` / `--cover-aspect-ratio` from the re-measure, the extracted `useModalDialog`, the `polyfillDialog` test helper).
**CLAUDE.md violations:** none found. **Explanations:** LT coverage adequate.

| Finding | What was done |
|---|---|
| Report missing; it needs the per-area table, the "intentionally not copied" list, verification, axe and CLS results | This file: §2 has all checks with numbers (238 tests, axe 0 on 8 page states, CLS ≤ 0.0002, overflow at 9 widths) and the per-area tables; the list is in §2 |
| Session log not committed | Owner step (§3, item 4) – `/export` is run by the owner at the end of the session |
| DESIGN.md 3.2 still said "2 on phones, cards stay vertical"; 4.6 "Desktop sort (not built)" conflicted with the built select | Fixed: the old phone-grid text is struck through with a pointer to the Task 11b note; the 4.6 bullet is now labelled "Eneba's desktop sort (reference)" and the custom menu "not built" |
| `useModalDialog` has no direct unit test (covered through FilterDrawer, StorePage and the menu tests) | Not changed: it is six lines of glue, and the three dialog test groups (open, close button, browser close/Esc, re-open) exercise every branch of it |
| The hover "View offers" label should be named in the report as adapted | Done: in the card table (§2) and §5 – it is part of the card link and `aria-hidden`; "Add to cart" is in "intentionally not copied" |
| Mention that the phone search open state could not be captured | Done in §5 |
| Cart badge hidden while empty, footer "Shop" duplicates the nav links | Observations only (documented and tested / all links work) – no change |

**Verdict after fixes:** all findings addressed or justified above.
