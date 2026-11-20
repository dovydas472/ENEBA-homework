# CLAUDE.md

## Project
Eneba-style game marketplace (internship assignment). React + TypeScript (Vite) at the repo root,
a Go API, Neon Postgres, deployed on Vercel (one Go serverless function + static frontend).
The owner must be able to explain ALL code in an interview, so keep code simple and explained.

## Verified on Vercel (do not re-question)
- The `/api/(.*)` rewrite works with the router. Go 1.25 builds on Vercel - never lower the `go` directive (and don't raise it by accident: check `go.mod` after `go get`/`go mod tidy`).
- Functions run in `fra1`. Preview deployments use the Neon `dev` branch, Production uses `production`.

## Structure rules
- `api/index.go` is the ONLY Go file in `/api` (each file there becomes a Vercel function). It only forwards to the router.
- All Go logic lives in `pkg/`, NOT `internal/`: Vercel builds `api/index.go` as a separate package and Go's `internal` rule breaks the build.
- Local dev server is `cmd/local`. Never add a root `main.go`, `cmd/api` or `cmd/server` (Vercel's Go preset auto-detects them and changes the deploy model).
- Router: standard `net/http` ServeMux (Go 1.22+ patterns like `GET /api/x/{id}`). No chi/gin.
  Dependencies are passed into `NewRouter(Deps{...})`; handlers depend on small interfaces, not concrete types (see `DBPinger`).
- `godotenv` is allowed only in `cmd/*` tools (`cmd/local`, `cmd/migrate`), never in `api/` or `pkg/`.
- Frontend API calls go through `src/api/client.ts` (`apiFetch`) and the `useApi` hook. No raw `fetch` in components.
- Money is integer cents. Never float.

## Database rules
- The app uses `DATABASE_URL` (Neon **pooled**, host contains `-pooler`). Migrations use `DATABASE_URL_DIRECT`. Never set the direct string on Vercel.
- Local `.env` points to the Neon `dev` branch only. Never connect to or modify the `production` branch.
- PgBouncer transaction mode: no session state (`SET`, `LISTEN`, SQL-level `PREPARE`). Keep pgx defaults.
- Never print, log or commit connection strings, passwords or `.env` contents. `.env` is git-ignored; only `.env.example` is committed.
- Never return raw DB/driver errors to the client; log server-side, return a generic message.
- Data model: see `docs/DATA_MODEL.md`. Any schema change must update it in the same PR.

## Migration rules
- Create migrations only with `go run ./cmd/migrate create <name>`. Never edit a migration that is already merged - add a new one.
- Migrations must be backward compatible with the code currently deployed (expand/contract: add first, remove in a later migration), because the Vercel deploy and the production migration run at the same time.
- Never run migrations against `production` locally. Production is migrated only by the GitHub Actions workflow `migrate-production.yml` (after merge, or the manual "Run workflow" button).
- `cmd/migrate` must never print the connection string, host, user or password (the Actions logs are public).

## UI rules
- UI: follow `docs/DESIGN.md`; use tokens from `src/styles/tokens.css`; CSS Modules only; no hardcoded colors/sizes.
- If a needed value has no token, add the token to `tokens.css` and document it in `docs/DESIGN.md` in the same PR. Breakpoints are the literal numbers from `DESIGN.md` (600 / 930 / 1200 px).
- Do not copy Eneba's logo, icons, illustrations or images. The wordmark is the text placeholder `APP_NAME`.

## Workflow rules
- One task = one branch `task/NN-short-name`, created from an up-to-date `main` (`git checkout main && git pull`).
- First commit of every task: the task file saved verbatim to `docs/tasks/TASK_NN_name.md`. Then work in small commits.
- Push the branch and open a PR to `main` (`gh pr create`). **Never merge, never push to `main`, never force-push.**
  If `gh` is missing or not authenticated: push the branch, skip the PR, tell the owner the exact command to run.
  After opening the PR, print the PR URL in the chat.
- If an exported session log is uncommitted in `ai-logs/`, commit it on the current task branch.
- Do not add dependencies, change architecture decisions, or widen the scope without asking. If something is unclear, ask - don't guess.
- Verify before reporting: `go build ./...`, `go vet ./...`, `go test ./...`, `npm run build` (plus the task-specific checks).
- Commits use the repo-local git identity (GitHub noreply email); do not change git config or remotes.

## Reporting rules
- Full report goes to `docs/reports/TASK_NN_name.md`, committed in the same PR. Sections:
  1. files changed, 2. verification results, 3. what the owner must do manually,
  4. plain-language explanation (what and why), 5. deviations from the task and why, 6. open questions.
- In chat: only a short summary (max ~8 lines) + PR link + report path.
- PR description: short summary + links to the task file and the report (use `.github/pull_request_template.md`).

## Explanation rules
- Short English comments at important functions (router, handlers, pool, client, hooks).
- `docs/PAAISKINIMAI_LT.md` (Lithuanian): for each important function/file - *ką daro, kodėl taip, ko gali paklausti pokalbyje*.
  Update it in every task that adds such code.
- Everything else in the repo (code, docs, commits, PRs, reports) is in English.

## AI logs
- At the end of a session the owner runs `/export`; logs are saved as `ai-logs/YYYY-MM-DD_NN_short-topic.md`.
- Remote work: `/export` does not work remotely. Then Claude Code converts the session transcript (JSONL under `~/.claude/projects/`)
  to Markdown in `ai-logs/YYYY-MM-DD_NN_short-topic.md`, redacts secrets, e-mail addresses and personal identifiers,
  and commits it on the current task branch.
