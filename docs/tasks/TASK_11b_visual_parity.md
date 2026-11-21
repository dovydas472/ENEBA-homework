# Task 11b – Visual parity with eneba.com: header, layout, Store page

**Model:** Opus · **Effort:** high (visual judgement + many small decisions)
Start after Task 11 is merged.

## Goal
The assignment says the app must look and feel like eneba.com. Today we have Eneba's tokens (colors, font), but layout and component details were built from `docs/DESIGN.md` text, not compared with the real site. This task makes the **header, global layout, product card and Store page** match eneba.com as closely as possible, by direct side-by-side comparison.

## Rules (owner decisions – do not change)
- **Fidelity target:** layout, proportions, spacing, typography sizes/weights, colors, card anatomy, filter sidebar look, sort control, pagination, hover/focus states, mobile layout – as close to eneba.com as possible.
- **Never copy:** Eneba's logo/wordmark, the name "Eneba" in our UI (except the demo banner/footer notice), their images, illustrations, icons as files, promo banners, or text content. Our wordmark stays **EneHomeworkBa**. The demo banner stays as is (phishing-risk mitigation).
- **No dead UI:** do not add controls for features we do not have (wishlist, cashback, language/currency switch, notifications, categories we have no pages for …). If Eneba shows such an element, leave the space out or adapt the layout; list it in the report under "intentionally not copied".
- Use only existing tokens or add new ones in `tokens.css` + `docs/DESIGN.md` in the same PR (CLAUDE.md UI rules). No new dependencies.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/11b-visual-parity`).

## 2. Capture the reference
- With the same headless-browser setup as before, capture eneba.com at **1440 × 900** and **390 × 844**: home (header only matters here), the store/catalog page with filters, a catalog page with a platform filter applied, and the mobile filter UI. Also our Preview/local pages at the same sizes.
- If eneba.com blocks automated capture, stop and ask the owner for screenshots (desktop + phone) of those pages.
- Store reference screenshots **outside the repo** (they are Eneba's copyrighted UI); put only **our** screenshots in `docs/reports/assets/`. In the report, describe the reference in words.

## 3. Compare and fix
For each area (header desktop, header mobile, demo banner placement, page background/containers, product card, filter sidebar, sort + result count bar, active-filter chips, pagination, mobile filter drawer, footer):
1. List concrete differences (measured where possible: heights, paddings, font sizes, radii, gaps, colors).
2. Fix them.
3. Re-capture and confirm.
Header: match Eneba's structure (positions of wordmark, search, account, cart; search field shape and placeholder style; heights). If Eneba has a secondary nav row, add one **only** with links that work (e.g. "Store", and platform shortcuts like "Steam", "PSN", "Xbox Live", "Nintendo eShop" linking to `/store?platform=…`).
Also add a **"Store" entry point** in the header and a **"Browse the store" button** on the Home placeholder (owner request).

## 4. Keep quality
- Existing tests stay green; update snapshots/tests whose markup changes intentionally.
- axe: 0 violations again on the changed pages (desktop + mobile). If Eneba's exact colors fail contrast somewhere, keep the accessible value and say so.
- CLS stays < 0.1.

## 5. CLAUDE.md
Add to the UI rules: "Every UI task ends with a side-by-side comparison against eneba.com at 1440 px and 390 px (reference screenshots outside the repo). The report lists the remaining differences and why (e.g. intentionally not copied, no such feature)."

## 6. Report
As defined in `CLAUDE.md`, plus:
- a table per area: difference found → what was changed → still different (why);
- our before/after screenshots (desktop + mobile) in `docs/reports/assets/task11b_*`;
- the "intentionally not copied" list.
Export the session log at the end and commit it on this branch.
