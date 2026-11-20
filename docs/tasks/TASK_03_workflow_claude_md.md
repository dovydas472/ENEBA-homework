# Task 03 – CLAUDE.md, tasks/reports in repo, branch + PR workflow

**Model:** Sonnet · **Effort:** high

## Goal
Set up the working rules once, so every future task follows them automatically:
standing rules in `CLAUDE.md`, task and report files versioned in the repo, every task on its own branch with a PR.
This task is the first one that follows the new workflow itself.

## 0. Workflow for this task (bootstrap)
1. `git checkout main && git pull`, then create branch `task/03-workflow`.
2. First commit: save this task file verbatim as `docs/tasks/TASK_03_workflow_claude_md.md`.
3. Do the work below in small commits.
4. Push the branch and open a PR to `main` with `gh pr create`. **Do not merge.**
   - First check `gh --version` and `gh auth status`. If `gh` is missing or not authenticated: push the branch, skip the PR, and tell me exactly what command I must run.

## 1. `CLAUDE.md` (repo root, English, concise – it is read at the start of every session)
Sections:

**Project** – one paragraph: Eneba-style marketplace (internship assignment), React + TS (Vite) at repo root, Go API, Neon Postgres, deployed on Vercel. I must be able to explain all code.

**Structure rules**
- `api/index.go` is the only Go file in `/api`; it only forwards to the router.
- All Go logic in `pkg/` (not `internal/` – Vercel builds `api/index.go` as a separate package and Go's `internal` rule breaks the build).
- Local server in `cmd/local` (never root `main.go`, `cmd/api`, `cmd/server` – Vercel's Go preset auto-detects those).
- Router: standard `net/http` ServeMux. Dependencies passed into `NewRouter`, handlers depend on small interfaces.
- Frontend API calls go through `src/api/client.ts` (`apiFetch`) and the `useApi` hook.
- Money is integer cents. Never float.

**Database rules**
- App uses `DATABASE_URL` (Neon pooled, `-pooler`). Migrations use `DATABASE_URL_DIRECT`. Never set the direct string on Vercel.
- Local `.env` points to the Neon `dev` branch only. Never connect to or modify the `production` branch.
- Never print, log or commit connection strings, passwords or `.env` contents.

**Workflow rules**
- One task = one branch `task/NN-short-name` from up-to-date `main`.
- First commit of every task: the task file saved verbatim to `docs/tasks/TASK_NN_name.md`.
- Push the branch and open a PR to `main`. **Never merge, never push to `main`, never force-push.**
- Do not add dependencies, change architecture decisions, or widen the scope without asking. If something is unclear – ask, don't guess.
- Verify before reporting: `go build ./...`, `go vet ./...`, `go test ./...`, `npm run build` (plus task-specific checks).

**Reporting rules**
- Full report → `docs/reports/TASK_NN_name.md`, committed in the same PR. Sections: files changed; verification results; what I must do manually; plain-language explanation (what and why); deviations from the task and why; open questions.
- In the chat, only a short summary (max ~8 lines) + PR link + report path.
- PR description: short summary + links to the task file and the report.

**Explanation rules**
- Short English comments at important functions.
- `docs/PAAISKINIMAI_LT.md` (Lithuanian): for each important function/file – *ką daro, kodėl taip, ko gali paklausti pokalbyje*. Update it in every task that adds such code.
- Everything else in the repo is in English.

**AI logs**
- At the end of a session I run `/export`; logs are saved as `ai-logs/YYYY-MM-DD_NN_short-topic.md`.

## 2. Repo files
- `docs/tasks/` and `docs/reports/` folders, each with a short `README.md` explaining what goes there.
- `.github/pull_request_template.md` with: Summary · Task file link · Report link · Manual test checklist (Preview URL checked, `/api/health` ok).
- Earlier tasks (01, 01b, 02): if their task files or reports are available to you in this session, add them to `docs/tasks/` / `docs/reports/` (reports may be reconstructed from your own earlier reports – mark them "reconstructed"). If not available, skip and list what is missing in the report; I will add them.

## 3. README
- Add a short "How this project was built" section: planning chat → task file → Claude Code on a branch → PR with report → review → merge. Point to `CLAUDE.md`, `docs/tasks/`, `docs/reports/`, `ai-logs/`.

## Out of scope
- No code changes in `api/`, `pkg/`, `cmd/`, `src/`.
- No GitHub settings changes (branch protection is done by me manually).

## Verify
- `CLAUDE.md` is concise (aim < 120 lines) and contains every rule above.
- Builds still pass (`go build ./...`, `npm run build`) – nothing broke.
- No secrets in any committed file (search for `postgresql://`, `-pooler`, `npg_`).
- PR is open (or the exact reason why not).

## Report
Follow the new reporting rules: full report in `docs/reports/TASK_03_workflow_claude_md.md`, short summary in chat.
