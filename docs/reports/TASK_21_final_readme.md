# Task 21 – Final README touch: counts and the final planning-chat link

Branch `task/21-final-readme` (from `main` after PR #23). Task file: [`docs/tasks/TASK_21_final_readme.md`](../tasks/TASK_21_final_readme.md).
Docs only: no code, no migration, no seed.

## 1. Files changed

| File | Change |
|---|---|
| `docs/tasks/TASK_21_final_readme.md` | the task file, verbatim (first commit) |
| `README.md` | "How this project was built with AI": 25 → **27** tasks, 22 → **24** pull requests, 254 → **276** commits on `main` before the last task, "(Task 19)" → "(Task 21)", 23 → **25** files in `ai-logs/`. Nothing else |
| `docs/reports/TASK_21_final_readme.md` | this report |
| `ai-logs/2026-11-24_03_final-readme.md` | this session's log (converted from the transcript, redacted) |

The planning-chat line is **unchanged**: the link the owner gave in the chat (§2) is the same one that is already in the README.

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...` | pass |
| `go test ./...` (`go test -json`) | pass: **235 top-level tests** (159 pass, 76 skip locally = database integration tests, `TEST_DATABASE_URL` empty; CI runs them), **447 subtests**, 0 failures – the same as the README |
| `npm run lint` | pass |
| `npm test` (PowerShell) | **628 tests in 50 files**, all pass – the same as the README |
| `npm run build` | pass |
| Relative links in the README | **52 of 52 exist** (files, folders, the 10 screenshots, and the 3 anchors `DATA_MODEL.md#4-…`, `DESIGN.md#5-accessibility`, `TASK_13a…#threshold-tuning-…`, each checked against its heading) |
| CI (PR #24) | CI_PLACEHOLDER |

### How each number was counted

| README number | Method | Value |
|---|---|---|
| Tasks | task numbers in `docs/tasks/`, amendments not counted (same as Tasks 18–19): `ls docs/tasks \| grep -v README \| grep -v amendment \| wc -l` → 01, 01b, 02–09, 10, 10b, 11, 11b, 12, 13a, 13b, 13c, 14, 15, 16a, 16b, 17–21 | **27** (this task included; `docs/tasks/` holds 31 files = 27 tasks + 3 amendments + `README.md`) |
| Pull requests | `gh pr list --state all --limit 100` → 23 PRs (#1–#23), all merged, none open or closed unmerged; + this PR (#24) | **24** |
| Commits on `main` before this task | `git rev-list --count main` with `main` = `42c7e63` (merge of PR #23), the same method as the Task 19 reviewer used for 254 | **276** |
| Files in `ai-logs/` | `ls ai-logs \| wc -l` → 24 on `main`, + this session's log | **25** |
| Go tests | `go test -json ./...`, top-level tests vs. subtests (names with `/`); the skipped top-level tests are the database integration tests | 235 = 159 + 76, 447 subtests – **unchanged** |
| Frontend tests | Vitest summary line of `npm test` | 628 in 50 files – **unchanged** |

## 3. What the owner must do manually

1. Nothing before the merge: no migration, no seed, no Vercel setting.
2. Read the open questions (§6) and decide which of them, if any, should become a small follow-up task. This task was not allowed to fix them.
3. After the merge the README's "24 pull requests" and "27 tasks" are exact. "276 commits on `main` before the last task" stays exact because it counts `main` *before* this task.

## 4. Plain-language explanation

This task changes almost nothing; it makes the numbers at the end of the README true again.

- **Why the numbers were stale.** The section "How this project was built with AI" was written in Task 19. Since then Task 20 and this task were added, and each added a pull request, commits and a session log. So "25 tasks, 22 PRs, 254 commits, 23 logs" were too small.
- **How I counted, so anyone can check.** Every number comes from a command, not from memory (the table in §2). Tasks are counted by task *number* (01b, 13a, … are separate tasks; amendments to a task are not), the same way as before, so the number stays comparable. The commit count is `main` *before* this task, because the commits of this task do not exist on `main` yet when the README is written. The log count already includes this session's log, because it is committed in this same PR.
- **The test counts did not change**, because Task 20 already updated them and this task adds no code. I ran the tests anyway, so the README's "235 / 447 / 628" are confirmed, not copied.
- **The planning-chat link.** The task said: ask, never guess. I asked; the owner gave the link that was already there, so the line stays as it is.
- **The read-only check.** I read the README from top to bottom and checked its facts against the code (seed numbers, sorts, limits, cache headers, password and session settings, CI, Node/Go versions, links). Almost everything matches. The few things that are out of date are listed in §6 and **not** changed, because the task allowed only the numbers and the link.

## 5. Deviations from the task and why

- **"(Task 19)" → "(Task 21)"** in "276 commits on `main` before the last task (Task 21)". The task says to update only the numbers. This is the number of the task that the commit count is measured before; leaving "Task 19" next to 276 would make the sentence false (254 was the count before Task 19). No other word on the line changed.
- **No change on the planning-chat line.** The task says to replace the link with the one the owner gives; the owner gave the identical link, so there was nothing to replace.

## 6. Open questions (findings of the consistency pass – not changed)

| # | Finding | Recommendation |
|---|---|---|
| Q1 | **The home screenshots are out of date.** `docs/screenshots/home-desktop.png` and `home-mobile.png` were taken in Task 17 (`bbc30fc`), before Task 20. The desktop one (looked at) still shows "Popular right now" with **GTA V ×3 and The Witcher 3 ×2** – exactly what Task 20 fixed – and the header with only "Sign in" (Task 19 added "Sign in \| Register"). They are the first picture in the README. All 10 screenshots the README embeds were last changed in that same Task 17 commit (`git log -1 -- docs/screenshots/<name>.png`), so all of them show the old header. | **Fix in a small follow-up:** retake the home screenshots at 1440 and 390 px (the Task 20 screenshots `task20-home-rows-*.png` already show the fixed rows, but only the rows). Highest value of all findings: it is the first thing a reviewer sees. |
| Q2 | **"27 tasks, from the project skeleton to the final audit"** – Tasks 20 and 21 come after the final audit (Task 19). | Change to "…to the final README" or just "from the project skeleton to the final touches". A few words, low priority. |
| Q3 | **Reference → Home page blocks: `GET /api/blocks/products/{key}`** says "the Store query, configured by the block row". Since Task 20 a row shows **one card per game and only in-stock products** (`docs/DATA_MODEL.md` and the code say so); the README does not. | Add "…, in-stock only, one card per game" to that cell. |
| Q4 | **"Content is inserted by migration `00006`"** – `00007_homepage_live_discount.sql` later changed the discount tile's title to the live "Up to −{maxDiscount}%". The sentence is still true (00006 inserts, 00007 only updates), but the README never mentions 00007. | Optional: "…by migrations `00006`–`00007`". Low priority. |

Checked and **consistent** (no finding): 108 products / 11 out of stock (`pkg/catalog/store_integration_test.go`), 7 sorts (`pkg/catalog/types.go`), `pageSize` 1–48 default 24, up to 6 suggestions (`MaxSuggestions`), all four `Cache-Control` values, argon2id 19 MiB / 2 / 1 / 16-byte salt, session 7 days, 10 failed sign-ins in 15 minutes, `demo.invalid`, orders list max 100, R1–R10 in `rules.go`, `TestK6_twoBuyersOneLastKey` / `TestK6_manyBuyersFewKeys`, `Store.WithClock`, autoplay 6 s, CI `go test -race` and `postgres:18`, Node 24 (`.nvmrc` 24.22.1), Go 1.25 (`go.mod`), the hero slides INNERT / GTA V / Witcher 3 and the 6 blocks in `00006`, `public/` and `src/` folders of the layout list, test counts. Not re-measured (outside a docs task): the Lighthouse and axe numbers.

## 7. Self-review (output of the `task-reviewer` subagent, run before this report; 2 commits at that time)

> # Task review: TASK_21_final_readme.md
> Branch: task/21-final-readme   Commits: 2   Files changed: 2 (README.md, docs/tasks/TASK_21_final_readme.md)
>
> ## 1. Requirements
> | # | Requirement | Status | Evidence |
> |---|-------------|--------|----------|
> | 0 | Task file saved verbatim as the first commit | done | 50bfb87 is first; docs/tasks/TASK_21_final_readme.md. I could not diff it against the original, so "verbatim" is unverified. |
> | 1a | Tasks count updated (distinct task numbers, amendments not counted, this task included) | done | README.md:220 says 27. I counted 01, 01b, 02-08, 09, 10, 10b, 11, 11b, 12, 13a-c, 14, 15, 16a, 16b, 17, 18, 19, 20, 21 = 27. |
> | 1b | Pull request count (this PR included) | done | README.md:221 says 24. main has merge PRs #1-#23, so 23 + this one = 24. |
> | 1c | Commits on `main` before this task | done | README.md:221 says 276. `git rev-list --count main` = 276. |
> | 1d | Files in `ai-logs/` (this session's log included) | done | README.md:223 says 25. 24 session logs are tracked (`.gitkeep` excluded), so 24 + this session's log = 25. The log is not committed yet, so it must be added before the PR. |
> | 1e | Go / frontend test counts only if changed | done | README.md:130 is unchanged. `git grep "^func Test"` still gives 235 and there are still 50 frontend test files. The 628 frontend tests and 447 subtests I could not re-count cheaply. No test code changed in this diff, so they should be unchanged. |
> | 1f | Report says how each number was counted | missing | The report does not exist yet (expected, it is written after this review). |
> | 2 | Replace the planning-chat link with the one the owner gives, after asking in chat | unsure | README.md:224 still holds the old link (`9db30da6-...`), and the diff does not touch that line. I cannot tell from the repo whether the owner confirmed the same link or whether it was never asked. The task says to ask the owner and not to reuse the old link without asking. The report must state which of these happened, and the owner's reply should be recorded. |
> | 3 | Consistency pass (read-only, findings as open questions), and every relative link in the README points to an existing file | partly | Relative links: my check found no missing targets, only an empty match, which is probably a `#anchor`. The report with the consistency findings does not exist yet. |
> | 4 | Report `docs/reports/TASK_21_final_readme.md`, with Section 4 in plain language | missing | The file does not exist (expected at this stage). |
> | 5 | Session log in `ai-logs/` | missing | The Task 21 log is not committed yet. README says 25 files, which only holds once it is added. |
>
> ## 2. Not asked for (scope creep)
> None found. The README diff is 3 lines of numbers, and README.md:221 also says "(Task 21)" where it used to say "(Task 19)", which is part of the count update.
>
> ## 3. CLAUDE.md violations
> None found. Docs only, no code, migration or seed change, and no secrets in the diff.
>
> ## 4. Missing explanations / tests
> None found. The task is docs only. `PAAISKINIMAI_LT.md` needs no update.
>
> ## 5. Other observations
> - Before the PR is opened, the report and the session log must be committed. The report must say how each number was counted and what happened with the planning-chat link. The "25 files" count depends on the log being committed.
> - README.md:220-221 now reads "27 tasks" while `docs/tasks/` holds 31 task files (amendments and `README.md` included). This is consistent with the "task numbers, amendments not counted" rule, but say it in the report.
> - README.md:221 says 24 pull requests, but only 23 are merged until this PR is opened. This is correct under "this PR included".
>
> ## Verdict: CHANGES NEEDED
> The three number updates are correct and nothing outside scope changed. However, the planning-chat link is unchanged with no evidence that the owner was asked, and the report and session log are still missing. These must be added and the link question settled before the PR.

**What was done about each finding:**

| Finding | Action |
|---|---|
| 0 – "verbatim" unverified | The file was written from the attached task text without edits; `git show 50bfb87` contains only that file. |
| 1e – 628 and 447 not re-counted by the reviewer | Re-counted by me: `go test -json` → 447 subtests; `npm test` → 628 tests in 50 files (§2). |
| 1f, 4 – report missing | This report; the counting methods are in §2 "How each number was counted". |
| 2 – planning-chat link: was the owner asked? | **Yes.** Before pushing I asked in the chat which link goes on the line (paste a new one, or keep the current one). The owner's answer was the link `https://claude.ai/share/9db30da6-b10e-41e1-87e0-97d396513889`, identical to the current one, so the line is unchanged (§1, §5). The question and the answer are in this session's log. |
| 3 – consistency findings missing | §6 (4 findings) + the list of checked claims; links: 52 of 52 exist, the 3 anchors match their headings (§2). |
| 5 – session log missing | `ai-logs/2026-11-24_03_final-readme.md`, committed as the last commit of this PR; with it `ai-logs/` has 25 files. |
| Other: 31 files in `docs/tasks/` | Explained in the §2 counting table (27 tasks + 3 amendments + `README.md`). |
| Other: 24 PRs although 23 merged | Correct by the task's rule "this PR included"; this PR is #24. |
