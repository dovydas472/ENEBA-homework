# Report – Task 03: CLAUDE.md, tasks/reports in repo, branch + PR workflow

Task file: [`../tasks/TASK_03_workflow_claude_md.md`](../tasks/TASK_03_workflow_claude_md.md)
Branch: `task/03-workflow` (from `main` at `dad8c2f`)

## 1. Files changed
- New: `CLAUDE.md` (47 lines), `.github/pull_request_template.md`, `docs/tasks/README.md`, `docs/reports/README.md`.
- Task files (verbatim): `docs/tasks/TASK_03_workflow_claude_md.md` (first commit of the branch), `TASK_01_project_skeleton.md`, `TASK_01b_fix_internal_import.md`, `TASK_02_db_connection.md`.
- Reports: `docs/reports/TASK_03_workflow_claude_md.md` (this file) and **reconstructed** `TASK_01_…`, `TASK_01b_…`, `TASK_02_…`.
- Changed: `README.md` (new "How this project was built" section).
- No changes in `api/`, `pkg/`, `cmd/`, `src/` (checked with `git diff --stat origin/main -- api pkg cmd src`: empty).

## 2. Verification results
- `CLAUDE.md` has 47 lines (< 120) and contains every section and rule from the task: Project, Structure, Database, Workflow, Reporting, Explanation, AI logs.
- `go build ./...`, `go vet ./...`, `go test ./...` pass; `npm run build` passes.
- Secret search over tracked files for `postgresql://`, `postgres://`, `npg_`, `-pooler`: matches are only descriptive text (task files, docs, `.env.example` comments), the fake URL `postgres://user:s3cret@host-pooler.example/db` in `pkg/server/health_test.go`, and quotes of those inside the session log. No real hostnames (`ep-…`, `neon.tech`) or credentials found.
- PR: **not opened**. `gh` is not installed on this machine (`gh --version` → command not found), so `gh auth status` could not run either. The branch is pushed; see section 3.

## 3. What the owner must do manually
Open the PR (the branch is already on GitHub), either:
1. In the browser: https://github.com/dovydas472/ENEBA-homework/pull/new/task/03-workflow , or
2. With the CLI: install and log in once, then create the PR:
   ```
   winget install --id GitHub.cli
   gh auth login
   gh pr create --base main --head task/03-workflow --title "Task 03: CLAUDE.md and PR workflow" --body "Adds CLAUDE.md, docs/tasks, docs/reports, PR template and README section. Task: docs/tasks/TASK_03_workflow_claude_md.md. Report: docs/reports/TASK_03_workflow_claude_md.md. No code changes."
   ```

Suggested PR description (for the browser route):
> Adds `CLAUDE.md` (standing rules), `docs/tasks/` and `docs/reports/` (task files and reports versioned in the repo, earlier tasks included), a PR template and a README section.
> Task: `docs/tasks/TASK_03_workflow_claude_md.md` · Report: `docs/reports/TASK_03_workflow_claude_md.md`. No code changes.

Also: set up branch protection on `main` yourself (out of scope here), and check that the PR template shows up on the new PR.

## 4. Explanation
`CLAUDE.md` in the repo root is read at the start of every Claude Code session, so the rules no longer have to be repeated in each
task: where Go code lives (and why `pkg/` instead of `internal/`), how the database is used safely, one branch + PR per task, never
merge or push to `main`, and how reports and Lithuanian explanations are written. Task files and reports are stored under `docs/` so
the history of what was asked and what was done is versioned together with the code, and each PR carries both. The PR template
reminds the reviewer to check the Vercel Preview and `/api/health`. The earlier tasks were added so the folders are complete from the start.

## 5. Deviations
- **PR not opened** because `gh` is missing (the task allows this: branch pushed, PR skipped, command given above).
- **Reports for tasks 01, 01b, 02 are reconstructed** from my earlier chat reports and marked as such; they were not written at the time.
- **`CLAUDE.md` has four small additions beyond the task text**, all taken from decisions already made in tasks 01–02: PgBouncer transaction-mode note; "never return raw DB/driver errors to the client"; "no raw `fetch` in components"; "use the repo-local git identity, do not change git config or remotes". Remove them if you prefer the rules exactly as listed.
- The secret search term `-pooler` necessarily matches documentation text; this is expected, not a leak.

## 6. Open questions
- Should `CLAUDE.md` mention the Go version requirement (currently `go 1.25.0` because of pgx)? I left it out because it can change.
- The rewrite-path question (Task 01) and Vercel's support for Go 1.25 (Task 02) are still untested on a real deploy.
- A leftover local Vite dev server (not started by me) was running on port 5173 during this session; it was left untouched.
