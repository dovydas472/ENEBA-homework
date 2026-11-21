# Report – Task 07: CI on every PR + task-reviewer subagent (+ addendum chores)

Branch: `task/07-ci-reviewer` · Task file: [`docs/tasks/TASK_07_ci_and_reviewer.md`](../tasks/TASK_07_ci_and_reviewer.md)

## 1. Files changed

**CI**
- `.github/workflows/ci.yml` (new) – jobs `go`, `migrations`, `frontend`; triggers `pull_request` + `push` to `main`; `concurrency` per ref with `cancel-in-progress`; `permissions: contents: read`; actions pinned to commit SHAs.
- `.nvmrc` (new) – `24.22.1` (the owner's local Node; exact version, because the Semgrep Guardian hook flags floating aliases such as `24`).

**Frontend tooling and tests**
- `eslint.config.js` (new) – flat config: `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` (Vite React-TS template set).
- `package.json`, `package-lock.json` – scripts `lint`, `test`; dev dependencies `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `vitest`, `jsdom`.
- `src/api/client.test.ts` (new) – 7 tests for `apiFetch`.
- `src/api/useApi.test.tsx` (new) – 6 tests for the `slow` signal of `useApi` (fake timers, jsdom).
- `src/api/useApi.ts` – refactored to fix the one existing lint error (see section 5).

**Reviewer subagent and rules**
- `.claude/agents/task-reviewer.md` (new).
- `CLAUDE.md` – verify list (+ `gofmt`, lint, tests), reviewer step, CI wait step, new "Testing rules", report section 7.

**Docs**
- `docs/PAAISKINIMAI_LT.md` – new sections: CI jobs, Up+Down on a clean DB, `TEST_DATABASE_URL` skip, ESLint/Vitest, `task-reviewer`; `useApi` section updated; Neon `production` branch fix.
- `docs/tasks/TASK_07_ci_and_reviewer.md` (new) – the task verbatim + the addendum (appended under a marked heading).
- `docs/reports/TASK_07_ci_and_reviewer.md` – this file.

**Addendum chores (one commit each)**
- `.gitattributes` (new): `* text=auto eol=lf`, `*.png binary`, `*.woff2 binary`. No tracked file needed renormalizing (the index was already LF); the working tree was refreshed to LF.
- `README.md`, `docs/PAAISKINIMAI_LT.md`: Neon Production branch is `production`, not `main`.
- `index.html`: `lang="en"`.
- `ai-logs/2026-11-20_02_design-tokens.md` deleted.
- `.github/workflows/migrate-production.yml`, `seed-production.yml`: pinned actions updated (see below).

**Other**
- `ai-logs/2026-11-20_05_igdb-seed.md` – the regenerated task 08 log, which was left uncommitted; committed here as `CLAUDE.md` requires.

### Action versions (all run on Node 24, pinned to full SHAs)
| Action | Version | SHA |
|---|---|---|
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-go` | v7.1.0 | `d8cbb8045d7f43706b9177cceb36c1f91a6644d5` |
| `actions/setup-node` | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |

Latest release was taken from the GitHub API; the tag → SHA mapping from `git ls-remote` (lightweight tags, so tag SHA = commit SHA); `runs.using: node24` was read from each `action.yml` at that tag. The v7 notes contain nothing that affects these workflows (the checkout `allow-unsafe-pr-checkout` change concerns `pull_request_target`, which we do not use).

## 2. Verification results

Local (Windows, Go 1.27.4 toolchain, `go.mod` still `go 1.25.0`, Node 24.22.1):

| Check | Result |
|---|---|
| `gofmt -l api cmd pkg migrations` | prints nothing |
| `go vet ./...` | OK |
| `go build ./...` | OK |
| `go test ./...` | OK (`cmd/migrate`, `pkg/dbsafe`, `pkg/igdb`, `pkg/seedgen`, `pkg/server`) |
| `npm run lint` | 0 problems |
| `npm test` (Vitest) | 2 files, 13 tests passed |
| `npm run build` | OK |
| YAML syntax of `ci.yml` | valid (`yaml-lint`, not added as a dependency) |

The `useApi` tests were written **before** the refactor and passed against the old hook and against the new one, so the refactor is behaviour-preserving.

**NOT verified – be aware:**
- **CI has not run.** The workflow triggers only on a PR to `main` / push to `main`, and `gh` is not logged in here, so I could not open the PR myself. Until the PR exists, "all three jobs green" is **unproven**. Open the PR with the link in the chat and check the three jobs (see section 3).
- **Job `migrations`** could not be tried locally: no Docker and no local Postgres on this machine, and I deliberately did not run `down` against the Neon `dev` branch (it would delete data). I reviewed it by reading: `cmd/migrate version` prints `current version: N` (matches the check), `dbsafe.CheckDirectURL` accepts a `localhost` URL, the Down script of migration 2 drops tables in dependency order.
- **`go test -race`** needs gcc, which is not installed locally; it runs only in CI.

## 3. What the owner must do manually

1. **Open the PR** with the pre-filled link (chat summary) and wait until the checks `go`, `migrations`, `frontend` are green. If one fails, send me the log and I will fix it on this branch.
2. **Ruleset `protect-main`** → add **Require status checks to pass** with exactly these check names: `go`, `migrations`, `frontend`. (Add them only after the first CI run, so GitHub offers them in the list.)
3. Run `/export` at the end of this session and commit the log in `ai-logs/` on this branch (`/export` is a user command; I cannot run it).
4. Optional: `npm ci` locally creates `node_modules/flatted/golang/...`, so a local `go build ./...` / `gofmt -l .` sees one third-party Go file. CI is not affected (no `npm ci` in the Go jobs); locally use `gofmt -l api cmd pkg migrations`.

## 4. Plain-language explanation

- **What CI is:** every PR now gets checked on a clean machine by three independent jobs. `go`: formatting, vet, build, unit tests with the race detector. `migrations`: an empty Postgres is started, all migrations are applied, rolled back one by one to version 0 (checked), and applied again – this proves every Up *and* every Down works from scratch; it also runs `go test ./...` with `TEST_DATABASE_URL` set so DB integration tests (later tasks) run there. `frontend`: `npm ci`, lint, Vitest, build.
- **Why integration tests skip without `TEST_DATABASE_URL`:** `go test ./...` must work for anyone without a database; DB tests run only where a throw-away DB is provided (CI) and never against Neon.
- **Why a separate reviewer:** the agent that wrote the code remembers what it meant to do. `task-reviewer` starts without that context and judges only from the files and `git diff main...HEAD` against the task file and `CLAUDE.md`. It is read-only, so it cannot "fix" the result to look good.
- **Why ESLint/Vitest:** lint finds mistakes without running the app (it found a real one, see below); Vitest tests the non-visual frontend logic (`apiFetch`, the `slow` timer) in milliseconds using a fake `fetch` and fake time.

## 5. Deviations from the task and why

1. **Postgres 18, not 17.** The task said 17 "check what Neon runs and match it". I checked the Neon `dev` branch with a throw-away program that printed only `show server_version` → **18.7**. CI uses `postgres:18`.
2. **`useApi` rewritten (not just touched).** `npm run lint` reported `react-hooks/set-state-in-effect` for the synchronous `setState` at the start of the effect. The task forbids disabling rules without a reason, and the rule is right (extra render), so I fixed the code: each request has an id (`attempt:path`); the stored result and the `slow` flag carry that id; `loading` = "stored result is not for the current request". Same behaviour (tests prove it), but more code to explain – the LT docs section and the comments cover it.
3. **Extra dev dependencies beyond the named ones:** `@eslint/js` and `globals` (part of Vite's template flat config) and `jsdom` (allowed "only if needed": React needs a DOM to render the hook). No Testing Library; the hook test uses `react-dom/client` + `act`.
4. **`.nvmrc` is `24.22.1`, not `24`.** A Semgrep Guardian hook flagged the floating alias (a Node 24 patch level with a known CVE cannot be excluded). The exact owner's version is pinned.
5. **Task file contains the addendum.** The task file is saved verbatim; the owner's addendum (chores + action updates) is appended under a marked heading in the same file, so the first commit holds all instructions.
6. **Uncommitted task 08 log committed here** (`c82bfa0`), as `CLAUDE.md` requires for a leftover log. It is unrelated to task 07 content-wise.
7. **Reviewer fallback during this session.** A new agent file is only registered when a session starts, so `task-reviewer` could not be called by name here. I ran a general-purpose subagent that had to follow `.claude/agents/task-reviewer.md` exactly (same prompt: "review task 07"). Its read-only rule was enforced by instruction, not by the tool list (I did not check for stray edits beyond `git status` being clean afterwards). From the next session on, the real `task-reviewer` agent is available.
8. **`CLAUDE.md` additions beyond the task text** (small, to make the rules usable): a fallback for reading CI results from the public API when `gh` is not logged in, and the Windows note about running Vitest from PowerShell (see section 6).
9. **No shared test helper** for `TEST_DATABASE_URL` was added (not asked for; no integration tests exist yet). The rule is in `CLAUDE.md`; the first DB task should add a tiny helper that does `t.Skip` when the variable is empty.

## 6. Open questions

- **Vitest and Git Bash on Windows:** from Git Bash (cwd with a lower-case `c:`) Vitest fails on any test with `Cannot read properties of undefined (reading 'config')` (two module copies because of drive-letter casing); from PowerShell with `C:\...` it works, and Linux CI is unaffected. I documented it in `CLAUDE.md`. Do you want a permanent workaround (e.g. a Vitest `resolve` setting), or is "use PowerShell" enough?
- Should `protect-main` also require the Vercel preview check, or only `go`, `migrations`, `frontend`?
- The `cancel-in-progress` on `push` to `main` can cancel an earlier `main` run when two merges happen quickly. This follows the task text; tell me if `main` runs should never be cancelled.

## 7. Self-review

Output of the independent review (verdict **PASS**). Run on the branch state before this report, via the general-purpose fallback described in section 5 (item 7). Abridged only by merging identical-status rows; evidence and wording are the reviewer's.

**1. Requirements** – all **done**:
- Branch and task file as first commit (`0ebd232`); `ci.yml` triggers, `concurrency`, `permissions: contents: read`, SHA-pinned actions (`ci.yml`); job `go` (setup-go from `go.mod`, gofmt check that prints the files, vet, build, `-race` tests); job `migrations` (service container with health check, `sslmode=disable` URL, up → all down to 0 with version check → up → status, then `go test ./...` with `TEST_DATABASE_URL`); job `frontend` (`.nvmrc`, npm cache, `npm ci`, lint, test, build).
- The reviewer confirmed against code that `ls migrations/*.sql` counts the two migrations, `version` prints `current version: N` (`cmd/migrate/main.go:104`) and `dbsafe.CheckDirectURL` accepts a localhost URL.
- Postgres 18 instead of 17 noted as following the "match Neon" instruction.
- ESLint flat config + `npm run lint` (`eslint.config.js`, `package.json`), no `eslint-disable` in the diff; Vitest + `npm test`; `apiFetch` tests (JSON, non-2xx, timeout, + parse/network/abort) and the `useApi` `slow` test with the 1499/1500 ms boundary.
- Subagent file with name, description, read-only tools, procedure, verdict, independence; `CLAUDE.md` workflow, CI wait, testing and reporting rules; LT docs sections.
- Addendum 1–5 done (`.gitattributes`, `production` branch name, `lang="en"`, log deleted, actions updated).
- *Not yet verifiable at review time:* task section 6 (green CI on the PR, reviewer output in the report) and section 7 (owner ruleset step in the report) – this report now lists the owner step (section 3); CI is pending the PR (section 2).

**2. Not asked for:** (a) the regenerated task 08 log is unrelated to task 07 (allowed by `CLAUDE.md`; mentioned in section 5); (b) extra dev dependencies `@eslint/js`, `globals`, `jsdom` (justified in section 5); (c) the `useApi` refactor is larger than a minimal lint fix (justified in section 5).

**3. `CLAUDE.md` violations:** none found (`go.mod` unchanged, no Go files touched, no raw `fetch` outside `client.ts`, CI DB credentials are a throw-away container password on `localhost`, no Neon hosts/tokens in the added lines, no migration edited, branch created from `main`).

**4. Missing explanations / tests:** none found. Minor: `.nvmrc` and `.gitattributes` have no dedicated LT section (`.nvmrc` is mentioned in the CI section).

**5. Other observations:** the report was still to be written (done now); the `useApi` `.then` is not guarded by `signal.aborted`, which is harmless because results are tagged with `requestId` (an aborted request's result can never match the current id) – an interview talking point; the reviewer asked for an owner spot-check of the action SHAs (done by me against upstream, see section 1) and a glance at the added lines of the task 08 log (I grepped it: 0 e-mail matches; the `neon.tech` hits are grep-pattern text, not hosts).

**What I did about the findings:** nothing required code changes (verdict PASS); the "mention in the report" items are all in section 5/6 above.

**Verdict: PASS**
