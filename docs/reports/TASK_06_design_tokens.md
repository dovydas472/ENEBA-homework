# Report – Task 06: Eneba design reference + CSS tokens

Task file: [`../tasks/TASK_06_design_tokens.md`](../tasks/TASK_06_design_tokens.md)
Branch: `task/06-design-tokens` (from `main` at `e1de211`, after the merge of PR #2; worked in a separate git worktree)

## 1. Files changed
- New: `docs/tasks/TASK_06_design_tokens.md` (verbatim, first commit).
- New: `docs/DESIGN.md` — tokens with a source for every value, layout (desktop + mobile), 11 component specs with states, accessibility (full contrast table), research notes and gaps.
- New: `src/styles/tokens.css` — all tokens as custom properties on `:root`.
- New: `src/styles/global.css` — font loading, minimal reset, body defaults, global focus ring, reduced-motion.
- New: `src/styles/fonts/` — `metropolis-latin-{400,500,700}-normal.woff2` (≈ 25 kB each) and `UNLICENSE.txt`.
- Changed: `src/main.tsx` (two `import` lines for the CSS), `CLAUDE.md` (new "UI rules" section), `docs/PAAISKINIMAI_LT.md` (4 new sections).
- New: `docs/reports/assets/task06_health_ok_desktop.png`, `task06_health_error_mobile.png` (screenshots, see 2).
- New: `ai-logs/…` (session log, remote procedure) — committed last.
- No changes in `api/`, `pkg/`, `cmd/`, `migrations/`, `package.json`, `go.mod`; no `src/*.tsx` changes besides `main.tsx`. No dependency added.

## 2. Verification results

| Check | Result |
|---|---|
| `go build ./...`, `go vet ./...` | pass |
| `go test ./...` | pass (`cmd/migrate`, `pkg/server`) |
| `go.mod` `go` directive | still `go 1.25.0` |
| `npm run build` (`tsc -b && vite build`) | pass; the CSS (4.2 kB) and the three woff2 files are in `dist/assets/` |
| Tokens wired on the health page | Dev server + headless Edge: `body` computed `background: rgb(70, 24, 172)` (= `#4618ac`), `color: #fff`, `font-family: Metropolis, Arial…` 16px/24px, `color-scheme: dark`; `document.fonts` reports **Metropolis 400 loaded**; no horizontal scroll at 1440 px or 390 px |

**Screenshots** of the health page (taken at 1440×900 and 390×844):
- [`task06_health_ok_desktop.png`](assets/task06_health_ok_desktop.png) — "API: ok · DB: ok (12 ms)" (the `/api/health` response was mocked in the browser because no Go server/DB runs in this worktree).
- [`task06_health_error_mobile.png`](assets/task06_health_error_mobile.png) — real "API: error" + Retry state (no API behind the dev server). Both: deep-purple page, white Metropolis text. The Retry button is still the browser-default button (global styles do not restyle buttons; the button component comes with the first UI task). The other two combinations (ok/mobile, error/desktop) were also taken and look the same, only the width differs.

**Contrast check** (WCAG, alpha composited; full table in `docs/DESIGN.md` §5.1): all text pairs pass ≥ 4.5:1 — e.g. white on page 10.57, on panel 8.23, on card 17.37; muted text 4.79–8.84; yellow accent on page 7.25; black on yellow button 14.40; green region text on card 7.65 / page 4.65.
**One failure and fix:** Eneba's error pink `#e76a8c` is 3.44:1 on the page → error *text* uses `#f0a3b8` (5.35:1); `#e76a8c` stays only for input outlines (non-text, ≥3:1). `#f0a3b8` is 4.17:1 on the lighter panel → documented: no error text directly on a panel.

## 3. What the owner must do manually
1. Review `docs/DESIGN.md` (you must be able to explain it): especially §2 (source legend S/C/D/A) and §6 (gaps).
2. Open the Vercel Preview and check the health page: purple background, white text in Metropolis (not Arial). Hard-refresh once so the font loads.
3. **Send screenshots** of Eneba's **sign-in** page and **cart** (desktop + mobile width) and of a **hovered product card** if you want §3.6 / §4.3 to be exact (see 5/6).
4. Pick the app name and replace `APP_NAME` (not used in any code yet).
5. The session log in `ai-logs/` was converted from the session transcript by Claude Code (remote procedure, `/export` was not used) — skim it to make sure nothing personal remained after redaction.

## 4. Plain-language explanation
**What:** we now have one written design guide (`docs/DESIGN.md`) and the same values as code (`tokens.css`). Every later screen takes colors, sizes and spacing from these variables instead of inventing its own, so everything looks like Eneba from the first commit and a change (e.g. the yellow) is a one-line edit.

**How the values were found:** eneba.com could be read, so nothing was guessed from memory. I downloaded its CSS and counted the most common colors, radii, font sizes, shadows and breakpoints, then loaded the real pages in a headless browser to read the *computed* style of actual elements (card, button, filter, header, offer row) and their sizes at desktop and phone widths. Every token in the guide says where it came from.

**What Eneba actually looks like:** not black — a deep **purple** page (`#4618ac`), a lighter purple filter panel, a darker card, a **yellow** primary button (`#fad318`), mint/green for regions and cashback, and almost no rounded corners. Font: **Metropolis**, which is free, so it is used directly (self-hosted, no Google request).

**Why plain CSS Modules + CSS variables:** no new library to explain; each component's styles stay local; variables give consistency. Accessibility: contrast was checked and one color fixed; a yellow focus ring and ≥40 px tap targets are part of the base.

## 5. Deviations from the task and why
- **Did not stop to ask for sign-in and cart screenshots.** The task says to stop if the site cannot be fetched. Home, store and product pages (everything needed for tokens, layout, card, filters, offers) were fetched fine. Sign-in is behind a Cloudflare challenge (not bypassed) and the cart is not a fetchable page; I did not wait for screenshots because the shared components cover them, and I recorded the gap in `DESIGN.md` §3.6/§6. If you want those two pages exact, send the screenshots and I will update the guide in a follow-up.
- **Font:** the task's alternative-font clause did not apply — Metropolis is free. `DESIGN.md` names Montserrat as the closest Google Fonts substitute should you ever want one.
- **Font weights:** files are declared as 400/500/700 instead of Eneba's 400/600/800 labels — same two Eneba files (Medium, Bold), true weights.
- **Font files source:** copied from the `@fontsource/metropolis` npm package (licence Unlicense, upstream repo checked); the package itself is **not** added to `package.json` (CLAUDE.md: no new dependencies without asking).
- **Sizes in `rem`**, root font-size not 62.5% like Eneba (keeps the user's browser setting).
- **Search text 19px → 20px**, to stay on the type scale.
- **Skeleton, toast, empty, error, select menu, seller rating, spinner, focus ring, z-index scale** have no Eneba source — derived from tokens and marked **D** in `DESIGN.md`.
- **Tools used outside the repo:** `puppeteer-core` was installed in the session scratch folder (not in the project) to drive the installed Edge for measurements and screenshots; the Eneba screenshots stay out of the repo (brand imagery).
- Some probes of `my.eneba.com` returned HTTP 429 (rate limit); I stopped probing there. Total requests to eneba.com were a few dozen page loads, spaced out.
- The health page text touches the screen edge (no padding): the reset removed the default body margin, and page layout/padding belongs to the first page task (task says "no other UI changes").

## 6. Open questions
1. Is a purple "dark theme" what you want to build on? (It is what Eneba looks like; the task said "dark theme only (as Eneba)".)
2. App name for `APP_NAME`?
3. Screenshots for sign-in, cart and a hovered card — send them, or accept the derived versions?
4. Product page container: Eneba's is wider than the store's (≈1360 px content at 1440). Keep that (`--page-max-width-wide`) or use one width everywhere?
5. Grid tiers between 601 and 930 px are approximate (Eneba has breakpoints at 800 and 930); compare with screenshots when the store page is built.
