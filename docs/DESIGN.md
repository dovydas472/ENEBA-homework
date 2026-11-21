# Design reference

The single source of truth for how every screen looks. Every UI task follows this file and uses the variables in
[`src/styles/tokens.css`](../src/styles/tokens.css). The base styles (reset, font, focus ring) are in
[`src/styles/global.css`](../src/styles/global.css).

The goal is the **look** of eneba.com (colors, type, spacing, shapes, layout) — not its brand. We do not copy the logo,
icons, illustrations or images. The wordmark is the text placeholder `APP_NAME` until the owner picks a name.

**Contents:** [1. How to use](#1-how-to-use) · [2. Tokens](#2-tokens) · [3. Layout](#3-layout) ·
[4. Components](#4-components) · [5. Accessibility](#5-accessibility) · [6. Research notes](#6-research-notes-and-gaps)

---

## 1. How to use

Rules for every future UI task:

1. **Never hardcode** a color, font size, spacing, radius, shadow or z-index in a component. Use `var(--token)`.
   If a value you need does not exist, add a token to `tokens.css` and to this file in the same PR — do not invent a one-off.
2. **Styling = CSS Modules.** One `Component.module.css` next to `Component.tsx`. No Tailwind, no CSS-in-JS, no UI library,
   no inline `style={{…}}` for visuals.
3. **Pick tokens by role, not by looks.** "Muted text" is `--color-text-muted`, even if it happens to look like another color.

| I need… | Use |
|---|---|
| Page background | `--color-bg` (set once on `body`) |
| Panel lighter than the page (filter sidebar) | `--color-surface` |
| Darker block (product card, nav strip, popup) | `--color-surface-card` / `--color-bg-deep` |
| Input / select background | `--color-surface-inset` + `--shadow-inset` |
| Normal / secondary / hint text | `--color-text` / `--color-text-muted` / `--color-text-subtle` |
| Primary button, link, checked checkbox | `--color-accent` (hover `-hover`, pressed `-active`) |
| Region/platform text, cashback text, success | `--color-secondary` / `--color-success` |
| "-66%" discount, "Cashback: €2" | `--color-discount` |
| Price | `--color-price`, `--font-size-xl` (card) / `--font-size-3xl` (product page), bold |
| Error text / error input outline / destructive background | `--color-error` / `--color-error-border` / `--color-danger` |
| Divider / outline | `--color-border` (subtle) / `--color-border-strong` (secondary button) |
| Gap between things | `--space-1…7` (5, 10, 15, 20, 30, 40, 60 px) |
| Hover/focus color change | `transition: … var(--transition-fast)` |
| Stacking | `--z-*` (never a raw number) |

**Breakpoints** cannot be variables (`var()` does not work inside `@media`). Write the numbers: `600px`, `930px`, `1200px`
(see [3. Layout](#3-layout)). Mobile-friendly rule of thumb: write the desktop style, then override in `@media (max-width: …)`.

**Money** is integer cents in the code; format it only at display time with `Intl.NumberFormat` (see the price display component).

---

## 2. Tokens

**Source legend** (every token has one):

| Code | Meaning |
|---|---|
| **S** | Computed style read from the live page with a headless browser (Edge) on **2026-11-20**. S1 = `/store/all` at 1440 px, S2 = a product page, S3 = same store page at 390 px |
| **C** | Rule found in Eneba's published CSS bundles (`static.eneba.games/main.*.css` and the page chunks). Class names are hashed, so the rule is identified by what it styles |
| **D** | Derived by us (Eneba has no equivalent we could read). Built only from other tokens |
| **A** | Adjusted by us for accessibility; the original is noted |

Eneba does not use CSS custom properties — all of its values are literals. The names below are ours.

### 2.1 Colors

Eneba's "dark theme" is **deep purple**, not neutral black. Page `#4618ac`, panels lighter, cards darker, yellow accent.

| Token | Value | Used for | Source |
|---|---|---|---|
| `--color-bg` | `#4618ac` | page background | S1 `body` computed; C `body{background:#4618ac}` |
| `--color-bg-deep` | `#351183` | nav strip, popups | C (`#351183`, 46 uses). Eneba paints the nav as `rgba(0,0,0,.25)` over the page, which is ≈ `#351281` (S1) |
| `--color-surface` | `#5825cc` | filter sidebar, panels | S1 filter group computed bg |
| `--color-surface-card` | `#1f0a4d` | product card body | S1 card body computed bg |
| `--color-surface-row` | `rgba(0,0,0,.3)` | offer row | S2 offer row computed bg |
| `--color-surface-inset` (`-hover` `-focus`) | `rgba(0,0,0,.2)` (`.35`, `.3`) | text input / select | S1 filter input; C `.inputForm:hover/:focus` |
| `--color-surface-hover` | `rgba(255,255,255,.1)` | hover on menu items | D |
| `--color-overlay` | `rgba(0,0,0,.55)` | label strip over a cover image | S1 platform strip |
| `--color-footer-bg` | `rgba(0,0,0,.7)` | footer | S1 `footer` |
| `--color-skeleton` (`-shine`) | `rgba(255,255,255,.1)` (`.2`) | loading placeholder | D |
| `--color-text` | `#fff` | text, headings, prices | S1 |
| `--color-text-muted` | `rgba(255,255,255,.7)` | counts, hints | S1 filter counts |
| `--color-text-subtle` | `#b3aac9` | "From", old price, placeholder | S1 "From" label; C placeholder rule |
| `--color-text-nav` | `#dcd8e6` | nav + footer links | S1 nav links, footer links |
| `--color-text-on-accent` | `#000` | text on the yellow button | C primary button rule |
| `--color-text-on-light` | `#1f0a4d` | text on the mint cashback badge | S1 badge |
| `--color-accent` | `#fad318` | primary button, links, checked controls | C (97 uses); S1 "Add to cart" |
| `--color-accent-hover` / `-active` | `#f0a613` / `#d7930e` | primary button states | C primary button `:hover` / `:active` |
| `--color-secondary` | `#23c299` | regions/platforms, cashback text, success | S1 region line; C |
| `--color-secondary-soft` | `#63e3c2` | cashback badge background | S1 badge bg |
| `--color-promo` | `#d32252` | cart-count / promo badge background | C (counter badge, promo pill) |
| `--color-price` / `--color-price-old` | `#fff` / `#b3aac9` | price / struck-through price | S1 |
| `--color-discount` | `#84e916` | "-66%", "Cashback: €2.23" | S1 discount computed color |
| `--color-success` | `#23c299` | success messages | = secondary (C) |
| `--color-warning` | `#f0a613` | warnings | C (Eneba's hover amber; no warning component exists) |
| `--color-error` | `#f0a3b8` | error text / icon | **A** — Eneba's `#e76a8c` is only 3.4:1 on the page; `#f0a3b8` is in Eneba's CSS too and gives 5.35:1 |
| `--color-error-border` | `#e76a8c` | error outline on inputs | C `outline:1px solid #e76a8c` (non-text, 3:1 is enough) |
| `--color-danger` / `-hover` | `#d32252` / `#a21a4a` | destructive/alert background (white text) | C |
| `--color-border` | `rgba(255,255,255,.25)` | subtle outline, popup edge | C |
| `--color-border-control` | `rgba(255,255,255,.7)` | checkbox / radio outline | S1 checkbox |
| `--color-border-strong` | `#fff` | secondary button, search field | S1 |
| `--color-control-hover` / `-active` | `rgba(0,0,0,.3)` / `rgba(0,0,0,.4)` | secondary button hover / pressed background | C secondary button rule (4.1); added in Task 10 |

The favicon [`public/favicon.svg`](../public/favicon.svg) is our own "EH" monogram (not Eneba's logo). An SVG file cannot read CSS variables, so it repeats two token values by hand: `--color-bg` `#4618ac` (background) and `--color-accent` `#fad318` (letters). Update it if those tokens change.

### 2.2 Typography

**Font: Metropolis** — the font Eneba itself serves (`font-family: "metropolis"`). It is **free** (Unlicense / public domain,
source <https://github.com/dw5/Metropolis>), so no substitute is needed. We self-host three weights in
[`src/styles/fonts/`](../src/styles/fonts/) (latin subset: covers Lithuanian letters, `€`, `–`, `…`; ~25 kB each) —
copied from the `@fontsource/metropolis` npm package, which is **not** installed as a dependency. We did not copy Eneba's
own font files.
Fallback stack if the font fails to load: `Arial, Helvetica, sans-serif` (the same fallback Eneba uses).

> If the owner later prefers a Google Fonts alternative, the closest match is **Montserrat** (similar geometric shapes, a bit wider).
> Not used now — Metropolis is free, so it is closer.

Eneba declares its files as weights 400 / 600 (file "Medium") / 800 (file "Bold"). We use the same two files under their real
weights, 500 and 700 — the rendering is identical.

| Token | Value | Used for (Eneba source) |
|---|---|---|
| `--font-size-2xs` | 10px | micro labels: "FEATURED OFFER", platform name on cover, "Best cashback" (S2, C) |
| `--font-size-xs` | 12px | card title, regions, "From", old price, footer links (S1) |
| `--font-size-sm` | 14px | filter labels + counts, header links, helper text (S1) |
| `--font-size-md` | 15px | button label (C) |
| `--font-size-base` | 16px | body, nav links, filter group headings (S1) |
| `--font-size-lg` | 20px | search field text, section subheading (S1 was 19px → rounded to the scale) |
| `--font-size-xl` | 22px | price on a product card (S1) |
| `--font-size-2xl` | 24px | page title on mobile (S3) |
| `--font-size-3xl` | 28px | price on the product page, wordmark (S2) |
| `--font-size-4xl` | 30px | page title on desktop (S1 `h1`) |
| `--font-weight-regular` / `-medium` / `-bold` | 400 / 500 / 700 | body / labels, nav, small UI / headings, buttons, prices |
| `--line-height-none` | 1 | single-line labels, buttons, prices (C: most used) |
| `--line-height-tight` | 1.25 | headings (S1 `h1` 37.5/30) |
| `--line-height-snug` / `-base` | 1.5 | card title (12/18), body (16/24) (S1) |

Notes: sizes are `rem` (the user's browser font setting is respected); Eneba uses `html{font-size:62.5%}` — we do not.
Headings, titles, buttons and prices are **bold** (700); medium (500) is for list labels, nav and small UI text.
Text is `-webkit-font-smoothing: antialiased` (S1 `body`).

### 2.3 Spacing, radii, shadows, z-index, motion

| Group | Tokens | Source |
|---|---|---|
| Spacing | `--space-1…7` = 5, 10, 15, 20, 30, 40, 60 px | S1/S2 paddings are almost all multiples of 5 (card body 15, panel 20, row 20, grid gap 22) |
| Radii | `--radius-none` 0 · `-sm` 3px · `-md` 5px · `-pill` 50px · `-round` 50% | C `border-radius` usage: buttons, cards, inputs, panels are **square**; checkbox 3px; pill tags 50px; avatars 50% |
| Shadows | `--shadow-inset` `inset 0 1px 3px #1f0a4d` (inputs) · `-dropdown` `0 7px 15px rgba(0,0,0,.2)` · `-popup` `0 7px 17px rgba(0,0,0,.55)` · `-modal` `0 2px 27px rgba(0,0,0,.5)` · `-toast` `0 3px 9px rgba(0,0,0,.4)` | C. Mapping shadow → component is ours (**D**) |
| z-index | `--z-base` 0 · `-raised` 1 · `-sticky` 10 · `-dropdown` 20 · `-drawer` 30 · `-modal` 40 · `-toast` 50 | **D**: Eneba uses 1, 2, 19–21, 999, 333333 ad hoc; we use a small named scale |
| Motion | `--duration-fast` 150ms, `--ease` ease-in-out, `--transition-fast` | C: `transition: … 150ms ease-in-out` on 60+ rules |
| Focus ring | `--focus-ring-color` `#fad318`, `-width` 2px, `-offset` 2px | **D/A** — Eneba shows almost no focus indicator (it re-uses the hover color); we need a real one |

### 2.4 Breakpoints and layout tokens

Breakpoints (from Eneba's most-used media queries, C): **600px**, **930px**, **1200px** (also 800 and 400 appear).
Also seen: `(hover: hover)` / `(hover: none)` (30 uses each) — hover-only effects must have a touch alternative.

Layout tokens: `--page-max-width` 1240px (1200 + 2×20 gutter), `--page-max-width-wide` 1440px + `--page-gutter-wide` 40px (product page),
`--header-height` 56px (mobile), `--header-top-height` 97px, `--nav-height` 50px (desktop), `--sidebar-width` 220px,
`--card-min-width` 165px, `--grid-gap` 22px, `--control-height` 40px (inputs), `--button-height` 35px (40px ≤600px),
`--hit-target-min` 40px.
Added in Task 10 (values from 3.1, 4.1, 4.5 and 4.11): `--search-height` 57px (header search, desktop), `--search-max-width` 550px,
`--icon-size` 24px (header icons), `--icon-size-sm` 20px (icon inside the search field), `--spinner-size` 16px (button spinner),
`--badge-count-size` 16px (cart count badge minimum size), `--toast-max-width` 400px (toast / "waking up" notice).
Added in Task 11 (Store page): `--opacity-dimmed` 0.8 (out-of-stock card and the results while a new result loads; 0.7 failed the contrast check of the mint platform text, 0.8 gives 5.0:1),
`--cover-aspect-ratio` 5 / 7 (cover box, 4.3), `--checkbox-size` 20px (4.8), `--price-input-width` 77px (4.2 / 4.8),
`--slider-thumb-size` 20px (the painted thumb), `--slider-thumb-hit` 24px (the clickable thumb; 40px = `--hit-target-min` at ≤930px) and `--slider-track-height` 4px (4.8, price slider).

---

## 3. Layout

All measurements were taken from the live site (S1–S3). The page is **centered, max 1200px content**, 20px side gutter.

### 3.1 Header

**Desktop (≥931px)** — two rows, total 147px:

```
┌ row 1 (97px: 20px padding, 57px content) ─────────────────────────────────────────────┐
│ [APP_NAME]  [ 🔍 Search for games, top-ups and more      ]  Locale  ♡  🛒  Log in | Register │
├ row 2 nav strip (50px, full-bleed, bg rgba(0,0,0,.25)) ───────────────────────────────┤
│ ☰ Categories   Cheap Games   Software   eGift Cards   …   [promo pill]                │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- Wordmark: text `APP_NAME`, `--font-size-3xl`, bold, white, links to `/`. (Eneba's logo is 155×48 — placeholder box is the same size.)
- Search: 550px wide, 57px tall, **1px solid `--color-border-strong`**, no radius, 10px padding, magnifier icon on the left,
  text `--font-size-lg` bold, placeholder `--color-text-subtle`. Grows to fill the free space.
- Locale / currency: ghost button, `--font-size-sm` medium (e.g. "English EU | EUR"). **Optional** for us (no localisation yet).
- Wishlist and cart icon buttons: 44×57 hit areas, icon turns `--color-accent` on hover/focus. Cart shows a count badge (`--color-promo`).
- Account: "Log in | Register", `--font-size-sm` medium, 10px padding; hover → accent.
- Nav strip: items `--font-size-base` medium, color `--color-text-nav`, 10px padding, 50px tall; hover → accent.
  A promo pill (gradient `--color-promo` → `#3c1395`, bold) is allowed at the end of the strip.

**Mobile (≤930px)** — one row, 56px: `☰` · `APP_NAME` · search icon (opens a full-width search) · ♡ · 🛒 · account icon.
Categories move into the hamburger drawer. Every icon button is at least 40×40.

### 3.2 Store page (catalog with filters)

```
Desktop ≥931                                       Mobile ≤600
┌ H1 "Games, Gift Cards…"  (30px bold) ──┐         ┌ H1 (24px bold) ───────────┐
│ ┌─────────┐ Results found: 1000+  Sort▾│         │ Results found: 1000+      │
│ │ filters │ ┌────┐┌────┐┌────┐┌────┐   │         │ [ ⚙ Sort and filter (1) ] │
│ │ 220px   │ │card││card││card││card│   │         │ ┌───────────────────────┐ │
│ │ panel   │ └────┘└────┘└────┘└────┘   │         │ │▭ title      ♡         │ │
│ └─────────┘ …                          │         │ │  REGIONS             🛒│ │
└────────────────────────────────────────┘         └─┴───────────────────────┴─┘
```

- **H1** margin `10px 0 30px`. Below it: filter sidebar (220px, `--color-surface`, groups stacked) + results area (gap 20px).
- **Results bar:** "Results found: N" (`--font-size-sm`, muted) on the left, sort select on the right.
- **Grid** (measured; card = 223–225px wide, gap 22px):

| Viewport | Layout |
|---|---|
| ≥1101px | sidebar + **4** columns |
| 931–1100px | sidebar + **3** columns (card ≈ 190–210px) |
| 801–930px | compact (mobile) header, sidebar + **3** columns |
| 601–800px | no sidebar (filters in a drawer behind "Sort and filter"); `repeat(auto-fill, minmax(var(--card-min-width), 1fr))` |
| ≤600px | **1 column of horizontal cards** (see product card, mobile) |

  Eneba showed 4 narrow columns at 768px; with `auto-fill` and a 165px minimum we get the same there and never narrower.
  The exact 801–930 tier is approximate (header and sidebar breakpoints differ in Eneba's CSS) — compare with a screenshot when the page is built.
- **Mobile filters:** a "Sort and filter (N)" button opens a 300px drawer from the left (`--color-surface`, `--z-drawer`, `--shadow-modal`);
  N = number of active filters.

  **As built in Task 11 (owner decisions S1–S9, they replace the measured Eneba details above where they differ):** the page title is "Store"; the results bar shows "N results"
  (announced with `aria-live`), the sort select, a "Filters (n)" button (≤930px only) and, on its own row, the active-filter chips with "Clear all".
  The sidebar (Platform, Region, Price range) shows at ≥931px; below that the same groups open in a **full-screen** native `<dialog>` drawer with a "Show N results" button.
  Grid: **4 columns above 1200px, 3 from 601 to 1200px, 2 on phones** (cards stay vertical on phones; the horizontal list card of 4.3 is not used), gap `--grid-gap`, `--space-2` on phones.
  Pagination (Prev, 1 2 3 … 5, Next; 24 per page) sits under the grid.

### 3.3 Product page

- Wider container: `--page-max-width-wide`, 40px gutters (content spanned x = 40…1400 at 1440px).
- Breadcrumb row (`--font-size-sm`, muted, `›` separators).
- Two columns: **left** (≈ 980px) = cover (224px wide, portrait) + info block; **right** (310px) = *buy box*.
  - Info block: pill tag (e.g. "Cashback deal"), `h1` 26px bold, then 2×2 facts grid (region, platform, key type, refund) — each a heading (bold, 16px) + helper text (`--font-size-sm`, muted).
  - Buy box (right): "FEATURED OFFER" label, old price + discount, price (`--font-size-3xl`, bold), cashback line, "Buy now" (primary) + add-to-cart icon button (secondary), 15px gap.
  - Below: screenshot strip (176×99 thumbnails), then **"Offers" section** = list of offer rows (see 4.7).
- **Mobile:** one column: cover → title → facts → buy box → offers; buy box buttons are full-width.

### 3.4 Home page (for reference, not part of this scope)

Full-bleed banner row, category icon carousel (icon + 12px bold label), then product-card rows ("Recommended for you", `--font-size-3xl`-ish section heading 28px bold).

### 3.5 Footer

`--color-footer-bg` (`rgba(0,0,0,.7)`), full-bleed, about 540px tall on desktop: columns of links (`--font-size-xs`, `--color-text-nav`), social links, legal line.
Mobile: columns stack, link rows get ≥40px tap height.

### 3.6 Cart and sign-in

**Not researched — Eneba blocks automated access** (sign-in is behind a Cloudflare challenge; the cart is not a fetchable page).
Until the owner supplies screenshots, build them from the same components: the cart is a list of offer-row-like rows on `--color-surface-row`
with a summary panel on `--color-surface` and a primary button; sign-in is a centered panel on `--color-surface` with text inputs (4.2) and a primary button.
See [6. Research notes and gaps](#6-research-notes-and-gaps).

---

## 4. Components

States for every interactive component: **default · hover · focus-visible · active · disabled · loading**.
**Focus-visible is the same everywhere:** `outline: var(--focus-ring-width) solid var(--focus-ring-color); outline-offset: var(--focus-ring-offset)` — already in `global.css`, so a component only needs to *not remove* it.
**Disabled:** `opacity: .5`, `cursor: not-allowed`, `pointer-events: none` (C: Eneba uses exactly this on buttons).
**Loading:** the control keeps its size, `aria-busy="true"`, clicks are ignored, the label is replaced by a 16px spinner (`border: 2px solid currentColor; border-top-color: transparent; border-radius: var(--radius-round)`, 0.8s linear infinite) — **D**.

### 4.1 Button

Common: height `--button-height` (35px; 40px ≤600px), padding `0 var(--space-2)`, `--font-size-md`, bold, `--line-height-none`, centered, **no radius**, `transition: … var(--transition-fast)` (all C/S1).

| Variant | Look | Hover | Active / pressed |
|---|---|---|---|
| **Primary** | bg `--color-accent`, text `--color-text-on-accent` | bg `--color-accent-hover` (also on `:focus`) | bg `--color-accent-active` |
| **Secondary** | transparent bg, `1px solid` `--color-border-strong`, white text | bg `rgba(0,0,0,.3)`, border `--color-accent` | bg `rgba(0,0,0,.4)` (also `:focus-visible`) |
| **Ghost / link** | no bg or border, `--font-size-sm` medium (nav, "Log in"); in-text "3 more" is accent + bold | text → `--color-accent` | — |
| **Danger** (D) | bg `--color-danger`, white text | bg `--color-danger-hover` | same as hover |
| **Icon button** | 40×40 minimum, icon `currentColor`, no bg | icon → `--color-accent` | — |

Disabled and loading as above. A primary button is allowed **once per view area** (the main action).

### 4.2 Input and search field

- **Text input:** height `--control-height` (40px), padding-left `--space-4`, bg `--color-surface-inset`, **no border**,
  `box-shadow: var(--shadow-inset)`, text `--font-size-base` medium, placeholder `--color-text-subtle` (S1 filter input).
  Hover bg `--color-surface-inset-hover`; focus bg `--color-surface-inset-focus` + the focus ring; disabled `opacity:.5`.
  (Eneba hides the placeholder on focus; we keep it visible.)
- **Label:** `--font-size-sm`, medium; required marker `*` in `--color-accent` (C).
- **Error:** `outline: 1px solid var(--color-error-border)` and a message under the field, `--font-size-xs`, `--color-error`, `role="alert"` or `aria-describedby` (the outline alone is not enough).
- **Search field (header):** see 3.1 — wrapper has the 1px white border; on `:focus-within` the **wrapper** gets the focus ring (`outline` on the wrapper, none on the inner input) so the ring surrounds the whole field (**D**).
- Number input (price range): two 77px-wide inputs with a bold "–" between, spin buttons hidden (C).

### 4.3 Product card

Square-cornered block, bg `--color-surface-card`, no border, no shadow (S1). Whole card is one link; the action buttons are separate controls.

```
┌──────────────────────┐  cover: 5:7 portrait image (≈223×312), object-fit: cover, bottom 60px
│        cover         │  holds the overlays:
│  [⟳ CASHBACK]        │   • cashback badge (mint, 12px bold uppercase) at the lower left
│▒▒ ◉ Steam ▒▒▒▒▒▒▒▒▒▒│   • platform strip: --color-overlay, 22px tall, 10px label + 16px icon
├──────────────────────┤
│ Title of the game…   │  padding 15 15 10; title 12/18 bold, 2 lines max (ellipsis)
│ GLOBAL, EUROPE       │  regions: 12px bold uppercase --color-secondary, 1 line (ellipsis)
│ From €59.99 −66%     │  "From" 12px bold subtle; old price subtle struck; discount --color-discount
│ €20.28 ⓘ             │  price 22px bold white
│ Cashback: €2.23      │  12px bold --color-discount
│ [ Add to cart ]      │  actions (see states)
│ [ View offers ]      │
└──────────────────────┘
```

| State | Behaviour |
|---|---|
| default | as above, actions not visible |
| hover (desktop, `(hover:hover)`) | the two actions appear below the price: **primary "Add to cart"** + **secondary "View offers"** (193×35px, 10px gap, 15px top padding); in the DOM they sit below the visible card area, so the card grows/overlays on hover (inferred, not measured while hovering) |
| focus-visible | cover link shows the global focus ring; actions are revealed with `:focus-within` |
| touch (`(hover:none)`) | actions are always visible — never hover-only |
| disabled / unavailable | whole card `opacity: .5`, price replaced by "Out of stock" (`--color-text-muted`), actions removed (**D**) |
| loading | skeleton card (4.10) |

Optional corner promo tag: bg `--color-accent`, text `#2c0e6c`, `--font-size-2xs` bold, radius `--radius-sm`, at `top:-5px; left:-5px` (C).

**As built in Task 11:** cover (`--cover-aspect-ratio`, with a generated gradient placeholder showing the title when there is no cover or it fails to load), title (2 lines), the edition only when it is not "Standard",
platform and region as mint uppercase text (4.5, "Region / platform text"), then "From" + struck-through MSRP + discount (4.4) and the price, pinned to the bottom of the card.
Out of stock: no price, "Out of stock" in `--color-text-muted`, the card at `--opacity-dimmed` (still a link). No cashback badge, cart button or wishlist yet; the card has no action buttons (the whole card is the link).
Hover (only where `(hover: hover)`): `--shadow-popup` and an accent title.

**Mobile (≤600px)** — horizontal list item (S3): 348×132 on a 390px screen, padding 8px, 2-column grid: cover thumbnail **70×98** + info.
Title 12/15.6 bold, regions as above; price block; a **cart icon button** (≥40×40) bottom-right; a wishlist heart top-right;
cashback badge shrinks to a 26×26 mint square on the cover's right edge. The info column leaves 50px at the right for the cart button.

### 4.4 Price display

| Context | Size | Extra |
|---|---|---|
| Product card | `--font-size-xl` (22px) bold white, `--line-height-none` | "From" label above (12px bold `--color-text-subtle`) |
| Product page buy box / featured offer | `--font-size-3xl` (28px) bold | "Price is not final" helper `--font-size-sm`, `--color-text-nav`, with ⓘ |
| Offer row | `--font-size-xl` bold | |
| Old price | 12px bold `--color-price-old`, `text-decoration: line-through` | followed by discount `-72%` in `--color-discount`, 12px bold, 3px gap |
| Cashback line | `--font-size-sm` bold `--color-discount` (card: 12px) | icon + "14% Cashback", optional "Best cashback" pill |

Format: currency symbol first for EUR (`€19.92`), amounts from integer cents via `Intl.NumberFormat`. Never show a float computed in the UI.

### 4.5 Badge / tag

| Badge | Look |
|---|---|
| **Cashback (on cover)** | bg `--color-secondary-soft`, text `--color-text-on-light`, 12px bold uppercase, padding 7px 5px, 16px icon, no radius |
| **Region / platform text** | no box: 12px bold uppercase `--color-secondary` |
| **Platform strip (on cover)** | bg `--color-overlay`, text `rgba(255,255,255,.85)`, 10px bold, 22px tall |
| **Pill tag** ("Cashback deal") | `1px solid --color-secondary`, text `--color-secondary`, 16px bold, height 24px, padding `0 12px`, `--radius-pill` |
| **Small pill** ("Best cashback") | `1px solid --color-discount`, text `--color-discount`, 10px bold, padding `3px 5px`, `--radius-pill` |
| **Count badge (cart)** | bg `--color-promo`, white, 12px bold, min 16×16, radius 8px, padding `0.5px 4px 0` |
| **Promo corner tag** | see 4.3 |
| **Featured label** | "FEATURED OFFER": 10px bold uppercase `--color-accent`, no box |

### 4.6 Select (sort)

- **As built in Task 11:** a native `<select>` styled like the text input (4.2) with a "Sort by" label and a chevron, on desktop and phones alike (not the custom menu and not radio items in the drawer).
- **Desktop sort (not built):** a ghost button in the results bar: sort icon + "Popularity: Most popular" (`--font-size-base` bold, white) + chevron; opens a menu.
- **Menu (D):** bg `--color-bg-deep`, `--shadow-dropdown`, `--z-dropdown`, items 40px tall, `--font-size-sm` medium; hover bg `--color-surface-hover`; selected item has a left check and `--color-accent` text.
- **Form select** (e.g. "Country" in filters): same as the text input (4.2) with a chevron on the right; the native `<select>` is acceptable and preferred (keyboard and screen-reader support for free).
- Mobile: the sort list lives inside the "Sort and filter" drawer as radio items.

### 4.7 Offer row (product page)

```
┌ bg --color-surface-row, padding 20 ───────────────────────────────────────────────────┐
│ (●) Seller name  ★ 4.9 (1,234)              €69.99 −72%                               │
│     ✓ Verified            €19.92 ⓘ                          [ Add to cart ]           │
│                           ⟳ 14% Cashback  (Best cashback)                              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- Layout: flex row, gap 15px: left grid (avatar + seller info, gap 10px) and right block (price column + action).
- Avatar 40×40 `--radius-round`; seller name 16px medium; "Verified" line `--font-size-sm`, muted, with a check icon in `--color-secondary`.
- Seller **rating** (we need it): `★` in `--color-accent` + number `--font-size-sm` bold + count `--color-text-muted` — **D**, built from tokens (Eneba's offer rows we saw show "Verified by …", not a numeric rating).
- Price column right-aligned (4.4). Action: **secondary "Add to cart"** in a list; the **featured offer** (buy box) uses the **primary** button.
- Rows are stacked with a small gap (10px). No hover change is specified by Eneba; we add `--color-surface-hover` over the row on hover (**D**) only if the whole row is clickable — otherwise none.
- **Mobile:** columns stack: seller on top, price + full-width button below.

### 4.8 Filter group (sidebar)

- Group = panel bg `--color-surface`. Header button: padding `15px 20px 10px`, title 16px bold + chevron (rotates when collapsed). Body padding `0 20px 20px`. Groups stack without a gap, separated by a thin line (`--color-border`).
- **Checkbox list:** `<ul>` with 15px gap; each `<label>` is a 2-column grid, gap 15px: box + text (`--font-size-sm`, medium) and the **count** right-aligned (`--font-size-sm`, medium, `--color-text-muted`).
- **Checkbox:** 20×20, `2px solid --color-border-control`, `--radius-sm`; **checked** → border and fill `--color-accent`, tick `--color-bg-deep`; hover: border → `--color-accent` (**D**); focus-visible: global ring; disabled: `opacity: .3`. The real `<input>` stays in the DOM (visually hidden), so keyboard and screen readers work. The hit area is the whole label row (≥40px tall on mobile).
- **"N more"** toggle: ghost button, `--font-size-sm`, bold, `--color-accent`, with chevron.
- **Price range:** header "Price range (EUR)", two number inputs (4.2, 77px wide) with "–" between, applies on blur/Enter (no apply button).
  **As built in Task 11 (owner amendment):** above the two boxes sits a **dual-thumb slider** (two native `<input type="range">` over one track, step €0.50, range = `facets.priceRange` rounded out to the step).
  The boxes and the thumbs always show the same numbers; dragging updates the boxes live and the URL only on release. The thumbs cannot cross. A thumb at the end of the slider means "no limit".
  The boxes are text inputs with `inputmode="decimal"` (so "12,50" works and invalid text can be reported); an error message ("min > max", "not an amount") sits on `--color-surface-card` under the boxes (5.1: error text is not allowed directly on a panel), and no request is made.
  The painted thumb is `--slider-thumb-size`; its clickable area is `--slider-thumb-hit` (40px on touch-sized screens). With no price range (nothing in stock) the slider is disabled.
  Checkbox groups can be folded with their header button (`aria-expanded`); the "N more" toggle is not needed yet (8 platforms at most).
- **Search inside a group** ("Product type"): input with magnifier button on the right.
- **Loading:** checkbox rows replaced by 3–5 skeleton lines. **Empty:** hide the group.

### 4.9 Empty state and error state

Centered block inside the content area (not a modal), `padding: var(--space-6) var(--space-4)`, `text-align: center`, all **D**:

- **Empty** ("No results"): title `--font-size-lg` bold, one line of helper text `--font-size-sm` `--color-text-muted`, optional **secondary** button "Reset filters". No illustration.
- **Error with Retry:** title ("Something went wrong") `--font-size-lg` bold; message `--font-size-sm` `--color-text-muted` — a **generic** message, never a raw server/DB error;
  **primary** button "Retry"; `role="alert"`. While retrying the button is in its loading state. For a slow server (cold start) show "Waking up the server, this can take a few seconds…" as helper text (matches the existing health page).
- Inline (inside a small component, like a filter group): same copy, `--font-size-xs`, text button "Retry".

### 4.10 Skeleton loader

- Block bg `--color-skeleton`, `--radius-none`; a highlight (`--color-skeleton-shine`) sweeps left→right in a 1.4s linear infinite gradient animation (**D**). `prefers-reduced-motion` disables the sweep (handled in `global.css`).
- Skeleton **product card** = same outer size as the real card (bg `--color-surface-card`): cover block 5:7, then three bars (title 12px × 90%, regions 12px × 60%, price 22px × 40%).
- Skeleton **offer row** = same height as the real row; skeleton text uses bars, never the word "Loading…" (except the visible fallback on slow server, see 4.9).
- Use `aria-busy="true"` on the list while loading; skeleton elements are `aria-hidden`.

### 4.11 Toast

Small notification, bottom of the screen: desktop bottom-right (offset `--space-4`), mobile full width minus 2×`--space-2`. All **D** (built from tokens; the closest Eneba element is its cookie popup).

- Box: bg `--color-bg-deep`, `1px solid --color-border`, `--shadow-toast`, `--z-toast`, padding `15px 20px`, max-width 400px, text `--font-size-sm` medium white.
- Left 4px bar by type: success `--color-secondary`, error `--color-danger`, info `--color-accent`. Icon/label text for the type so color is not the only signal.
- Close button ≥40×40, ghost. Auto-dismiss after 5s; paused on hover and focus; errors stay until dismissed.
- `role="status"` + `aria-live="polite"` (errors: `role="alert"`). Enter/leave: fade + 8px slide, `--transition-fast`.

---

## 5. Accessibility

Minimums for every screen: text contrast **≥ 4.5:1**, non-text UI (borders of controls, icons) **≥ 3:1**, a visible focus ring on every interactive element, tap targets **≥ 40px** on mobile, everything usable by keyboard, motion respects `prefers-reduced-motion`.

### 5.1 Contrast check (WCAG 2.x relative luminance; transparent colors composited over the real background)

| Foreground on background | Ratio | Result |
|---|---|---|
| `--color-text` `#fff` on `--color-bg` `#4618ac` | 10.57 | pass |
| `#fff` on `--color-bg-deep` `#351183` | 13.47 | pass |
| `#fff` on `--color-surface` `#5825cc` | 8.23 | pass |
| `#fff` on `--color-surface-card` `#1f0a4d` | 17.37 | pass |
| `#fff` on offer row (`rgba(0,0,0,.3)` over page) | 14.17 | pass |
| `--color-text-muted` (white 70%) on page / panel / card | 5.85 / 4.79 / 8.84 | pass |
| `--color-text-subtle` `#b3aac9` on page / card / input-on-panel | 4.79 / 7.87 / 4.82 | pass |
| `--color-text-nav` `#dcd8e6` on `--color-bg-deep` | 9.62 | pass |
| `--color-accent` `#fad318` (links) on page / panel / card | 7.25 / 5.64 / 11.91 | pass |
| `--color-accent-hover` `#f0a613` on page | 5.12 | pass |
| `--color-text-on-accent` `#000` on `#fad318` / hover `#f0a613` / active `#d7930e` | 14.40 / 10.17 / 8.07 | pass |
| `--color-secondary` `#23c299` on card / page | 7.65 / 4.65 | pass (page is close to the limit — do not go smaller than 12px bold there) |
| `--color-discount` `#84e916` on card / page | 11.29 / 6.87 | pass |
| `--color-text-on-light` `#1f0a4d` on `--color-secondary-soft` `#63e3c2` | 11.00 | pass |
| `#fff` on `--color-danger` `#d32252` | 5.10 | pass |
| `--color-warning` `#f0a613` on page | 5.12 | pass |
| ~~Eneba error text `#e76a8c` on page / panel / deep / card~~ | 3.44 / 2.68 / 4.39 / 5.66 | **fails on page, panel and deep** |
| **`--color-error` `#f0a3b8` on page / deep / card** | 5.35 / 6.82 / 8.80 | pass — this is the **adjustment** |
| `--color-error` `#f0a3b8` on `--color-surface` (panel) | 4.17 | **fails** — do not put error text directly on a panel; put it inside a `--color-surface-card` block or use white text with the error outline |
| Non-text: checkbox border (white 70%) on panel | 4.79 | pass (≥3:1) |
| Non-text: `--color-error-border` `#e76a8c` on page | 3.44 | pass (≥3:1; text needs `--color-error`) |
| Non-text: focus ring `#fad318` on page | 7.25 | pass |

Disabled controls (`opacity: .5`) are exempt from the contrast rule (WCAG), but the disabled state must still be recognisable.
The numbers were computed with a small script (sRGB → relative luminance → `(L1+.05)/(L2+.05)`); re-check whenever a color token changes.

### 5.2 Other rules

- **Focus ring:** global `:focus-visible` yellow 2px ring with 2px offset (7.25:1 on the page). Never `outline: none` without an equivalent.
- **Tap targets:** icon buttons, checkbox rows, nav items, toast close ≥ **40×40px** on screens ≤600px (`--hit-target-min`). Buttons become 40px high via `--button-height`.
- **Color is never the only signal** (errors need text/icon, selected filter needs a check, cashback needs the word).
- **Small text:** `--font-size-2xs` (10px) is only for uppercase micro-labels (it is what Eneba does); informational text is ≥ 12px.
- Language: the document is `lang="lt"` (set in `index.html`); the font covers Lithuanian letters.

---

## 6. Research notes and gaps

**Done (2026-11-20, automated, one page load at a time):** home `/`, store `/store/all` (desktop 1440 and mobile 390, plus resizing through 360–1440),
a product page (`/steam-silent-hill-2-pc-steam-key-global`, offers visible). Method: Eneba's CSS bundles downloaded and analysed
(colors, radii, font sizes, shadows, z-index, transitions, media queries counted), then a headless Edge session read the computed styles
and rectangles of the real DOM and took screenshots. The screenshots are not committed (they contain Eneba's brand imagery).

**Could not be researched** — the task says to ask the owner for screenshots in this case:

| Page | Why | What we did meanwhile |
|---|---|---|
| Sign-in (`my.eneba.com/login`) | behind a Cloudflare "verify you are human" challenge. We do **not** try to bypass it. | built from shared components (4.1, 4.2); the sign-in CSS bundle is the same design system |
| Cart | not a fetchable page (a drawer/page that needs a session); some probes returned HTTP 429, so we stopped probing | described as composed from offer row + summary panel (3.6) |

**Derived without an Eneba source (D):** skeleton, toast, empty state, error state, select menu, seller rating, loading spinner,
focus ring, z-index scale. They only use tokens from this file, so they will look consistent.

**Not captured:** hover/active visuals were taken from CSS rules, not from screenshots of the live hover; the home page carousel; Eneba's
exact behaviour of the card's hover-revealed actions (see 4.3). If the owner sends screenshots of cart, sign-in and a hovered card, update 3.6 and 4.3.

**Asking the owner for the final name:** replace `APP_NAME` everywhere in one pass (header wordmark, `<title>`, README) when it is decided.
