# Task 07 – CI on every PR + task-reviewer subagent

**Model:** Sonnet · **Effort:** high
**Good for a night run.** Start it only after Tasks 05 and 06 are merged (it edits `CLAUDE.md` too).

## Goal
Every PR is checked automatically (Go, migrations on a clean Postgres, frontend), and every task is reviewed against its task file by a separate subagent before the report is written.

## Decisions (made by the owner – do not change)
- CI = GitHub Actions, jobs below. Actions pinned to commit SHAs (as in `migrate-production.yml`), `permissions: contents: read`.
- Add **ESLint** (flat config: `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`, like Vite's React-TS template) and **Vitest** for frontend unit tests. No other new tools.
- DB integration tests (written in later tasks) read `TEST_DATABASE_URL` and are **skipped when it is empty**. CI provides it from a Postgres service container. Locally it stays empty unless the owner sets it.
- Reviewer = Claude Code **subagent** in the repo (`.claude/agents/`), not a paid GitHub app.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/07-ci-reviewer`).

## 2. `.github/workflows/ci.yml`
Triggers: `pull_request` to `main`, `push` to `main`. `concurrency` per ref with `cancel-in-progress: true`.

Jobs (clear names – they become required checks):
- **`go`**: setup-go from `go.mod` → `test -z "$(gofmt -l .)"` (print the files if not) → `go vet ./...` → `go build ./...` → `go test -race ./...`.
- **`migrations`**: Postgres service container (version 17 – same major as Neon; check what Neon runs and match it), with health check. Env `DATABASE_URL_DIRECT` = the container URL (`sslmode=disable`). Steps: `go run ./cmd/migrate up` → roll **all** migrations down one by one until version 0 → `up` again → `status`. This proves every Up **and** Down works on a clean database.
  Also export `TEST_DATABASE_URL` (same container) and run `go test ./...` again in this job, so future integration tests run here.
- **`frontend`**: setup-node (version from a new `.nvmrc` matching the owner's local major Node version) with npm cache → `npm ci` → `npm run lint` → `npm test` (Vitest, run mode) → `npm run build`.

## 3. Frontend tooling
- ESLint flat config + `npm run lint` script; fix existing warnings/errors (no rule disabling without a reason in a comment).
- Vitest + `npm test` script (`vitest run`). Write tests for `src/api/client.ts` (`apiFetch`: JSON ok, non-2xx → `ApiError` with status/body, timeout) and the `slow` signal of `useApi` (fake timers). Use `jsdom` only if needed; keep deps minimal.

## 4. Subagent `.claude/agents/task-reviewer.md`
- Frontmatter: name `task-reviewer`, description saying it must be used at the end of every task, before the report; tools limited to read-only (`Read`, `Grep`, `Glob`, `Bash` for read-only git commands).
- Instructions for the subagent:
  1. Read `CLAUDE.md`, the current task file in `docs/tasks/`, `docs/DATA_MODEL.md` / `docs/DESIGN.md` if relevant, and `git diff main...HEAD`.
  2. Produce a checklist:
     - every requirement of the task → done / partly / missing (with file:line);
     - anything done that the task did **not** ask for (scope creep, new dependencies, architecture changes);
     - `CLAUDE.md` rule violations (structure, secrets/hosts in code or logs, raw DB errors to clients, `go` directive changed, raw `fetch` in components, hardcoded colors/sizes, float money, migration edited after merge, schema change without `DATA_MODEL.md` update);
     - missing explanations (English comments, `docs/PAAISKINIMAI_LT.md` sections) and missing tests for new logic.
  3. Verdict: `PASS` or `CHANGES NEEDED`. It never edits files.
- It must be independent: it judges only from the files and diff, not from the main agent's opinion.

## 5. `CLAUDE.md` updates
- Workflow: before writing the report, run the `task-reviewer` subagent; fix what it finds or justify why not; add its result as report section **7. Self-review**.
- After pushing and opening the PR: wait for CI (`gh pr checks --watch`) and include the result in the chat summary. CI must be green before asking for review; if it fails, fix it on the same branch.
- Testing: new Go logic gets unit tests; DB code gets integration tests using `TEST_DATABASE_URL` (skip when empty); frontend logic (non-visual) gets Vitest tests.
- Reporting rules: add section 7 "Self-review".

## 6. Verify
- Standard checks + `npm run lint` + `npm test` locally.
- Push the branch, open the PR, and confirm **all three CI jobs are green** (`gh pr checks`). If `gh` is not available, say so and give the PR link.
- Run the `task-reviewer` subagent on this task itself and include its output.

## 7. Owner manual steps (list them exactly in the report)
- Ruleset `protect-main` → add **Require status checks to pass** with the exact check names (`go`, `migrations`, `frontend`).

## 8. Docs
`docs/PAAISKINIMAI_LT.md`: what CI is and what each job proves; why migrations are tested Up+Down on a clean DB; why integration tests skip without `TEST_DATABASE_URL`; what the reviewer subagent does and why it is separate from the agent that wrote the code.

## Report
As defined in `CLAUDE.md` (+ section 7 Self-review). Export the session log at the end and commit it on this branch.

---

## Addendum (given together with the task; small chores, separate commits)
1. Add .gitattributes: `* text=auto eol=lf` (+ binary rules for png/woff2), so CRLF never reaches gofmt/CI on Windows. Renormalize if needed.
2. README and PAAISKINIMAI_LT.md: the Neon production branch is called `production`, not `main` – fix every mention.
3. index.html: lang="en".
4. Delete ai-logs/2026-11-20_02_design-tokens.md (superseded by 2026-11-20_04_design-tokens.md).
5. Update all SHA-pinned actions (checkout, setup-go, setup-node) in every workflow to their latest releases that run on Node 24, still pinned to full commit SHAs with a version comment.
