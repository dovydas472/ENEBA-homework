# Task 06 – Eneba design reference (`docs/DESIGN.md`) + CSS tokens

**Model:** Sonnet · **Effort:** high
**Can run in parallel with Task 05** (separate branch, no overlapping files).

## Goal
One design reference that every UI task will follow, so screens look like Eneba from the first commit and nothing must be restyled later.
Output: `docs/DESIGN.md` + `src/styles/tokens.css` (+ global base styles). No page components yet.

## Decisions (made by the owner – do not change)
- **Styling approach:** plain **CSS Modules** (`*.module.css`, built into Vite) + **CSS custom properties** for tokens. No Tailwind, no CSS-in-JS, no UI library.
- **Font:** if Eneba's font is proprietary or not freely licensed, use the closest free alternative (Google Fonts or self-hosted). Name both in `DESIGN.md`.
- **Brand assets:** do NOT copy Eneba's logo, icons, illustrations or images. Recreate the *look* (colors, typography, spacing, shapes, layout), not the brand. Use a neutral text wordmark placeholder `APP_NAME` – the owner decides the name later.
- Dark theme only (as Eneba).

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/06-design-tokens`).

## 2. Research eneba.com
- Look at: homepage, store/catalog page (with filters), a product page (with seller offers), cart, sign-in.
- Extract what you can from HTML/CSS (CSS custom properties, computed colors, font families, sizes, radii, shadows, breakpoints).
- If the site cannot be fetched (bot protection, JS-only rendering), **stop and ask the owner** for screenshots of those pages (desktop width + mobile width). Do not guess colors from memory.
- Record the source of every token (CSS variable name / page / screenshot) in `DESIGN.md`.

## 3. `docs/DESIGN.md`
- **Tokens:** colors (backgrounds/surfaces, text levels, primary accent, secondary accent, price color, success/warning/error, borders), typography scale (sizes, weights, line heights), spacing scale, radii, shadows, z-index levels, breakpoints, transition timing.
- **Layout:** header (logo, search, cart, account), page width, grid of product cards, store page (filter sidebar + results + sort), product page (info + offers list), footer. Desktop and mobile.
- **Components** (look + states: default/hover/focus/disabled/loading): button (primary/secondary/ghost), input + search field, product card (cover, title, platform/region badges, "from" price), price display, badge/tag, offer row (seller, rating, price, "Add to cart"), filter group (checkbox list, price range), select (sort), skeleton loader, empty state, error state with Retry, toast.
- **Accessibility minimums:** text contrast ≥ 4.5:1 (check the extracted colors and note any adjustment), visible focus ring, hit targets ≥ 40 px on mobile.
- A short "How to use" for future tasks: which token for what; never hardcode colors/sizes in components.

## 4. Code
- `src/styles/tokens.css`: all tokens as CSS custom properties on `:root`.
- `src/styles/global.css`: minimal reset, base typography, body background, focus ring, font loading. Import both in `main.tsx`.
- The existing health page should now render with the dark theme and the font (proves tokens are wired). No other UI changes.

## 5. Verify
- Standard checks from `CLAUDE.md`.
- Screenshot of the health page (desktop + mobile width) attached to / described in the report.
- Contrast check results for the main text/background pairs.

## 6. Docs
- `CLAUDE.md`: add "UI: follow `docs/DESIGN.md`; use tokens from `src/styles/tokens.css`; CSS Modules only; no hardcoded colors/sizes."
- `docs/PAAISKINIMAI_LT.md`: why CSS Modules + custom properties, what design tokens are, why not Tailwind/UI library, contrast rule.

## Out of scope
Page components, routing, any feature work.

## Report
As defined in `CLAUDE.md`. Export the session log at the end (remote procedure) and commit it on this branch.
