# Task 18 – Final README, interview cheat sheet, submission checks: report

Task file: [`docs/tasks/TASK_18_readme_submission.md`](../tasks/TASK_18_readme_submission.md) (+ addendum [`TASK_18_amendment_lighthouse_production.md`](../tasks/TASK_18_amendment_lighthouse_production.md): Lighthouse mobile on production) · Branch: `task/18-readme` · **No migration in this PR.** **One production step before merging:** *Seed production* with `aliases_only` (§3.1).

## 1. Files changed

**Docs (the task)**
- `README.md` – rewritten in the task's 11-part structure; the disclaimer block stays verbatim at the top. The earlier reference material (API tables, home blocks, auth, checkout, env vars, migrations, seed, layout) is kept, shortened, in collapsible `<details>` sections under "Reference", so nothing reviewers could need was dropped.
- `docs/PAAISKINIMAI_LT.md` – new section **"Svarbiausi klausimai pokalbiui"** at the top: 27 questions, 2–4 sentence answers, each with a link to the detailed section (links generated from the exact headings and checked). New Task 18 section at the end (`--aliases-only`).
- `docs/tasks/TASK_18_readme_submission.md` (verbatim) and `docs/tasks/TASK_18_amendment_lighthouse_production.md` (the addendum, verbatim, as a separate file like the Task 09 / 11 amendments); this report.

**Fix found by the checks (owner approved, see §5)** – production search had no aliases:
- `pkg/seedgen/db.go` – `InsertAliases` (fills only an **empty** `game_aliases`; every snapshot game must exist; identity restarted, same row order as a full seed → same ids), `ErrAliasesExist`, shared `copyAliases` (now also used by `Insert`).
- `cmd/seed/main.go` – flag `--aliases-only` (cannot be combined with `--reset`), same transaction + lock as a full seed.
- `.github/workflows/seed-production.yml` – boolean input `aliases_only` (error if ticked together with `reset`).
- `pkg/seedgen/aliases_db_test.go` (new) – 3 integration tests (run in CI's `migrations` job).

**Session logs** (`ai-logs/`)
- New, converted from the local transcripts and redacted (the check found these sessions without a log): `2026-11-21_04_catalog-api.md` (Task 09), `2026-11-21_05_app-shell.md` (Task 10), `2026-11-21_06_backend-hardening.md` (Task 10b), `2026-11-22_06_search-ui.md` (Task 13b), `2026-11-22_07_search-followup.md` (Task 13c).
- Redacted: the Windows user name in paths and `ls` output of the four oldest logs (`2026-11-19_01`, `2026-11-20_01/02/03`), as the later logs already do.

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...`, `go test ./...` | pass. `go test -json`: **225 top-level Go tests** – 151 pass, 74 skip locally (database integration tests, `TEST_DATABASE_URL` empty; CI runs them), 445 subtests pass, 0 failures |
| `npm run lint` | clean |
| `npm test` (PowerShell) | **50 files, 625 tests pass** |
| `npm run build` | passes (main JS 450.72 kB / gzip 144.03 kB, unchanged) |
| `cmd/seed --aliases-only` on Neon **dev** (has aliases) | `error: seedgen: search aliases already exist (134 rows); nothing was changed`, exit 1 – the refuse path; `--aliases-only --reset` → "cannot be used together", exit 2 |
| GitHub CI on the PR | see the PR / chat summary (filled in after the run) |

### README links and diagrams
Script in the session scratchpad (Node + mermaid 11 rendered in headless Edge + a GitHub-style heading slugger):
- **README:** 88 links – every relative file link and every `#anchor` (own sections, `DESIGN.md#5-accessibility`, `DATA_MODEL.md` sketch 4, the Task 13a threshold table) resolves; external links answer 200 (live URL, neon.tech, goose, kodmolab.lt ×2, Metropolis repo, lucide.dev). **`https://www.igdb.com/` answers 403 to scripts and headless Edge** ("Just a moment…" = Cloudflare bot check); it opens in a normal browser and was already linked before. `<SHARE_LINK>` is a placeholder on purpose.
- **Both Mermaid diagrams render** with mermaid 11 (sequence diagram 31 kB SVG, flowchart 19 kB). GitHub uses the same library; the final look on GitHub should still be glanced at on the PR page (§3).
- **`docs/PAAISKINIMAI_LT.md`:** 27 links, all anchors resolve (0 problems).

### Production smoke test (<https://enehomeworkba.vercel.app>, headless Edge, 1440 × 900 and 390 × 844 touch)
Fresh browser context per size, so each run is a new demo user. Script in the scratchpad; second run 2026-11-24 ~05:33 UTC.

| Step | Desktop | Phone |
|---|---|---|
| Home: hero + all blocks (INNERT, GTA V, Witcher 3 slides; Popular right now, Biggest discounts, New releases) | pass (run 1; in run 2 the check looked before the blocks rendered – script timing, fixed) | pass |
| Search suggestions "witchr 3" → The Witcher 3: Wild Hunt | pass | pass |
| Search suggestions **"gta"** | **FAIL: "No matches for 'gta'"** → the alias problem below | **FAIL** (same) |
| Enter → `/store?q=gta` | page works, but 0 results (+ "Popular right now") | same |
| Store filter Steam → `?platform=steam`, "54 results" | pass (sidebar) | pass ("Sort and filter" drawer → "Show 54 results") |
| Product → Add to cart → header "Cart, 1 item" | pass (Half-Life) | pass (BioShock Infinite) |
| Demo sign-in from `/login?next=/cart` → back on `/cart`, "Account: Demo user" | pass | pass |
| Checkout → **Decline** → "Payment declined (simulated)…", order stays payable | pass | pass |
| **Success** → `/orders/<id>`, key masked `DEMO-••••-••••-••••`, Reveal shows `DEMO-XXXX-XXXX-XXXX` | pass | pass |
| `/orders` lists the order as Paid | pass | pass |
| Demo banner on home, search, store, product, login, cart, payment, order, orders, 404 | pass | pass |
| Failed requests | only expected ones: `401 /api/auth/me` while signed out, `402 …/pay` (the simulated decline), 404 page | same |

The smoke runs bought **3 fake keys on production** (Half-Life ×2, BioShock Infinite ×1) as 3 demo users; that is what the demo is for.

**Found: production has no search aliases.** `GET /api/search/suggest?q=gta` / `rdr2` / `hzd` / `gt` → 0 items, `/api/products?q=gta` total 0, while `witcher` and `grand` (title matches) work. Cause, from the Actions log: the **Seed production** run after Task 13a (2026-11-22 18:32 UTC, run 45055657099) **failed at "Check the confirmation"** – `confirm` was entered as `eset, confirm = seed-production` and `reset` was unticked – and it was never re-run, so production's `game_aliases` stayed empty (the Task 13a report says search then "works on titles only"). A `--reset` re-run is no longer possible: production has orders, and the seed refuses to rewrite a catalog under them. **Fix (owner's choice):** `--aliases-only` (§1); the owner runs it before merging (§3.1), and I re-check `gta` / `rdr2` on production afterwards.

### Lighthouse mobile on production (addendum)
Lighthouse **12.8.2** (programmatic), default **mobile** preset: Moto G Power emulation, simulated slow 4G (150 ms RTT, 1.6 Mbps down), 4× CPU slowdown; headless Edge 157 on this Windows PC, home internet connection (Vercel edge: Stockholm `arn1`; function `fra1`). Each page loaded once (not counted) to warm the function and CDN, then **3 runs, median**. 2026-11-24, 05:15–05:17 UTC.

| Page | Score | LCP (median; runs) | FCP | CLS | TBT | LCP element |
|---|---|---|---|---|---|---|
| Home `/` | **97** (runs 82, 97, 97) | **2.29 s** (4.64, 2.28, 2.29) | 1.54 s | 0 | 89 ms | hero `<img>` |
| Store `/store` | **98** | **2.07 s** (2.07, 2.07, 1.98) | 1.68 s | 0.002 | 91 ms | demo-banner text |
| Product `/product/grand-theft-auto-v-steam-global` | **98** | **2.07 s** (1.92, 2.07, 2.08) | 1.68 s | 0 | 41 ms | demo-banner text |

Next to Task 17's local numbers (Home 2.68 s, Store 2.58 s, Product 2.47 s) – production is faster as Task 17 expected (Brotli, HTTP/2, CDN-cached registry). **All three are under 2.5 s on production.** Home's first counted run (4.64 s) was an outlier despite the warm-up; the median hides it and the README shows all three runs. Both tables are in the README "Quality" section with their conditions.

### axe-core on production
axe-core **4.14.1**, WCAG 2.0/2.1 A + AA + best practice, reduced motion: `/`, `/store`, `/store?q=witcher`, a product, `/cart`, `/login`, `/register`, a 404 – at 1440 and 390 px: **0 violations in 16 runs.**

### Repository history and logs
| Check | Result |
|---|---|
| `git log --all -p` (6.9 MB) – Neon passwords `npg_…` | **0** |
| Connection strings | only documentation/test placeholders (`ep-cool-name-123456…`, `*.example.com`, `host-pooler.example`, `localhost`, the CI container `postgres:postgres@localhost`); **no real Neon host** (every `*.aws.neon.tech` host is the doc example) |
| IGDB credentials | every `IGDB_CLIENT_ID=` / `IGDB_CLIENT_SECRET=` in history is empty or a placeholder (`<hidden>`, `...`); no `access_token` values |
| E-mail addresses | commit authors: the GitHub noreply address (+ `noreply@github.com` for merge commits); in diffs only `anthropic.com` (co-author lines), `users.noreply.github.com`, reserved/test domains (`example.com`, `demo.invalid`, `x.com` test strings in auth tests, `sub.example.lt`). **The owner's private address never appears.** |
| **Finding** | The **local part of the owner's private e-mail** appears **twice** in history, inside an organisation name in an early session log: added in `dad8c2f` ("Add Claude Code session log 2026-11-19"), removed in `d101c7e` ("…redact organisation name"). It is not in the current tree. Removing it from history would need a history rewrite + force-push (forbidden for me) – **owner's decision, §6** |
| `ai-logs/` completeness | before: 16 logs, **no log for Tasks 09, 10, 10b, 13b, 13c** (their transcripts were on this PC) → converted and committed (§1). Now **21 logs**, every task covered (Tasks 01/01b/02 are in `2026-11-19_01` + `2026-11-20_01`; the Task 07 log `2026-11-21_01_ci-reviewer.md`). This session's log is committed at the end |
| `ai-logs/` scan (all 21) | 0 connection strings (2 bare `postgres://` test strings), 0 `npg_`, 0 Neon hosts, 0 e-mails outside reserved/test domains, 0 private-address hits, 0 IGDB values, 0 tokens; Windows user name: 0 after the redaction |
| `robots.txt` / `noindex` on production | `User-agent: * / Disallow: /`; `<meta name="robots" content="noindex, nofollow" />` |
| Demo banner | on every page checked (smoke table) |

## 3. What the owner must do manually
1. **Before merging – add the search aliases to production:** *Actions → Seed production → Run workflow*, **"Use workflow from" = `task/18-readme`**, tick **`aliases_only`** (leave `reset` unticked), `confirm` = `seed-production` (exactly). The log must end with **`--aliases-only: search aliases inserted (committed): 134`**. Then check <https://enehomeworkba.vercel.app/store?q=gta> (4 games / 8 products) – the suggestion cache (`s-maxage=300`) may need up to 5 minutes; tell me and I re-run the smoke test. If it prints "already exist", someone filled the table already – nothing changed. **No migration in this PR** (no *Migrate production* run needed).
2. **Fill in the planning-chat link:** replace `<SHARE_LINK>` in the README ("How this project was built with AI").
3. **Decide about the old history finding** (§2 "Repository history", §6): leave it, or rewrite history yourself.
4. Glance at the README on the PR page (Mermaid diagrams, screenshot tables, the collapsible sections) and read the cheat sheet once; correct anything in "Who did what" that does not match how you worked.
5. Session log: committed on this branch (converted from the transcript, redacted); run `/export` too if you prefer the full export.

## 4. Plain-language explanation
- **The README** now tells a reviewer in a few minutes what the shop is, where to try it (with the demo-user and cold-start hints), how each part of the assignment was solved and where the code is, the two parts done in depth (buying keys safely, search), the architecture, the measured quality, an honest list of shortcuts, how to run it, and how AI was used. The long API tables are still there, folded away.
- **The cheat sheet** in the Lithuanian notes lists 27 likely interview questions with short answers and links to the long explanations.
- **The checks found one real problem:** on the live site, nicknames like "gta" found nothing. The production database never got its search nicknames, because the job that should have added them in Task 13a was started with a typo and stopped. Re-running it the old way is blocked on purpose (it would rewrite the catalog under real orders), so the seed tool got a small new mode that only fills the empty nickname table and touches nothing else.
- **Speed on the live site:** all three measured pages show their main content in about 2.1–2.3 s on a slow, emulated phone – better than the local measurement in Task 17.
- **Five work sessions had no log**, so they were converted from the saved transcripts, with secrets and personal data removed.

## 5. Deviations from the task and why
- **A code change larger than a "tiny fix"** (`--aliases-only`, ~70 lines + 3 tests + a workflow input). The task allows only tiny fixes; I asked first, and the **owner chose this option** (over a data migration or only documenting the gap). Without it the live search would not find "gta", which the task's own smoke test asks for.
- **Missing session logs were converted, not only listed.** The task asks to list missing sessions; the transcripts were on this PC and CLAUDE.md's remote-work rule describes exactly this conversion, so the logs are now complete. The original sessions are named in §1.
- **Old logs edited for redaction** (Windows user name only, 4 files) – same rule as all later logs.
- **The addendum is saved as its own file** (`TASK_18_amendment_lighthouse_production.md`), like earlier amendments, so the task file stays verbatim.
- **README reference sections kept (collapsed)** instead of deleted: the task lists 11 parts, but the API / migration / seed procedures are documentation other files link to; collapsing keeps the page scannable without losing them.
- **"Number of Go tests"** is given as test functions (225, of which 74 need Postgres) + subtests (445, counted locally), because the integration tests' subtests run only in CI.
- **Lighthouse on production created no data**; the **smoke test did** (3 demo users, 3 paid orders, 3 fake keys sold) – needed to test checkout end to end.

## 6. Open questions
1. **Old history finding:** the local part of your private e-mail is in two old commits of a session log (`dad8c2f`, removed again in `d101c7e`). Only a history rewrite + force-push can remove it (I must not do that). Leave it as is, or will you rewrite the history yourself?
2. Is the "Who did what" paragraph in the README accurate for how you worked (e.g. "tested the Preview deployments by hand", "ran the production migrations and seeds")?
3. **CLAUDE.md "Seed data rules"** describe only the empty / `--reset` modes. Should a line be added for `--aliases-only` ("fills only an empty `game_aliases`, allowed on a catalog with orders; production only via the workflow input `aliases_only`")? I did not edit `CLAUDE.md` myself – it is your rule file.

## 7. Self-review (task-reviewer)
Run after all code and docs except this report were committed (branch at a8d2a58), given only the task number. **Verdict: CHANGES NEEDED.**

| Reviewer finding | What was done |
|---|---|
| 0–2.11, 3, addendum: branch, verbatim task file, disclaimer, all 11 README parts, cheat sheet (27 questions, anchors spot-checked), production Lighthouse with conditions | done – no change |
| 4a–4d submission checks "partly": results not recorded yet (no report) | **Fixed:** §2 holds the link/Mermaid check, the smoke test (desktop + phone), the history scan and the ai-logs check |
| 4c "21 logs for 24 tasks, some tasks may have no log" | Checked task by task (§2): every task 01–17 has a log now (several tasks share a session log); Task 18 = this session, committed at the end |
| Scope: `--aliases-only` is more than a "tiny fix" | **Justified:** asked first, the owner chose this option (§5); listed as the first deviation |
| `copyAliases` refactor touches the working `Insert` path | Same rows in the same order; the golden test (`pkg/seedgen`) passes locally and the integration test compares the checksum of a full seed with aliases-only – CI runs it |
| CLAUDE.md seed rules do not mention the new mode | Not edited by me (owner's rule file) – open question 3 |
| **Windows user name still visible** in 3 logs inside the text of a redaction regex (`\bNAME\b`) | **Fixed:** replaced in `2026-11-20_04`, `2026-11-23_06`, `2026-11-23_07`; the converter now also redacts the name inside such text, so this session's log does not repeat it. Re-scan: 0 hits |
| No test for the `--reset` + `--aliases-only` flag conflict / workflow branch | Checked by running it (§2: exit 2 with the message); a CLI flag check, not covered by a unit test |
| Owner step: run *Seed production* with `aliases_only`, then verify `gta` | In §3.1 – **before** the merge, from this branch (the input exists only here until the merge) |
| `<SHARE_LINK>` must be filled in | §3.2 |
| `.vscode/` untracked, do not commit | not committed |
