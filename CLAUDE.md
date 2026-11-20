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
- `godotenv` is allowed only in `cmd/*` tools (`cmd/local`, `cmd/migrate`, `cmd/seed`, `cmd/igdb-snapshot`), never in `api/` or `pkg/`.
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

## Seed data rules
- `seed/igdb_snapshot.json` is generated **only locally by the owner** with `go run ./cmd/igdb-snapshot`. Never call IGDB from the app, `cmd/seed`, CI or Vercel.
- IGDB credentials (`IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`) live only in the local `.env`. Never in code, logs, GitHub secrets or Vercel; never print the token.
- `cmd/seed` is deterministic (fixed RNG seed, timestamps derived from the snapshot date, no `time.Now()` in generated data). The golden test in `pkg/seedgen` pins the output: if a rule or the snapshot changes on purpose, update the hash in the same PR and say so in the report.
- `cmd/seed` uses `DATABASE_URL_DIRECT` (same `-pooler` guard and redaction as `cmd/migrate`, shared in `pkg/dbsafe`), refuses a non-empty catalog without `--reset`, and writes everything in one transaction.
- Locally seed only the Neon `dev` branch. **Production is seeded only by the GitHub Actions workflow `seed-production.yml`** (manual, `confirm` = `seed-production`).
- Key codes are always fake: `DEMO-XXXX-XXXX-XXXX`.

## UI rules
- UI: follow `docs/DESIGN.md`; use tokens from `src/styles/tokens.css`; CSS Modules only; no hardcoded colors/sizes.
- If a needed value has no token, add the token to `tokens.css` and document it in `docs/DESIGN.md` in the same PR. Breakpoints are the literal numbers from `DESIGN.md` (600 / 930 / 1200 px).
- Do not copy Eneba's logo, icons, illustrations or images. The wordmark is the text placeholder `APP_NAME`.

## Workflow rules
- One task = one branch `task/NN-short-name`, created from an up-to-date `main` (`git checkout main && git pull`).
- First commit of every task: the task file saved verbatim to `docs/tasks/TASK_NN_name.md`. Then work in small commits.
- Push the branch and open a PR to `main`. **Never merge, never push to `main`, never force-push.**
- The PR is always created by Claude Code with the template already filled in: Summary (3–5 lines), Task file link, Report link, CI status, Manual test checklist.
  Use `gh pr create --title "Task NN: …" --body-file <generated file>`. After opening the PR, print the PR URL in the chat.
- If `gh` is missing or not logged in: push the branch and generate a pre-filled GitHub link instead, so the owner opens the PR with one click:
  `https://github.com/dovydas472/ENEBA-homework/compare/main...<branch>?expand=1&title=<url-encoded title>&body=<url-encoded body>`.
  Print that link as the last line of the chat summary.
- If an exported session log is uncommitted in `ai-logs/`, commit it on the current task branch.
- Do not add dependencies, change architecture decisions, or widen the scope without asking. If something is unclear, ask - don't guess.
- Verify before reporting: `gofmt -l .` (must print nothing), `go build ./...`, `go vet ./...`, `go test ./...`, `npm run lint`, `npm test`, `npm run build` (plus the task-specific checks).
  CI runs the same checks on every PR (`.github/workflows/ci.yml`; jobs `go`, `migrations`, `frontend`).
- Before writing the report, run the `task-reviewer` subagent (`.claude/agents/task-reviewer.md`). Give it only the task number, not your own opinion of the work.
  Fix what it finds, or justify in the report why not; its output goes into the report as section 7 (Self-review).
- After pushing and opening the PR, wait for CI (`gh pr checks --watch`) and put the result in the chat summary. CI must be green before asking for review;
  if it fails, fix it on the same branch. If `gh` is not logged in, read the check runs of the pushed commit from the public API instead
  (`https://api.github.com/repos/dovydas472/ENEBA-homework/commits/<sha>/check-runs`) and say so.
- Commits use the repo-local git identity (GitHub noreply email); do not change git config or remotes.

## Testing rules
- New Go logic gets unit tests. DB code gets integration tests that read `TEST_DATABASE_URL` and **skip when it is empty** (`t.Skip`).
  CI provides it from a Postgres service container (job `migrations`); locally it stays empty unless the owner sets it. Never point it at a Neon branch.
- Frontend logic that is not visual (api client, hooks, helpers) gets Vitest tests (`*.test.ts(x)` next to the code).
- No lint rule is disabled without a comment that explains why.
- Windows: run `npm test` / Vitest from PowerShell (canonical upper-case drive letter, `C:\...`). From Git Bash (lower-case `c:`) Vitest fails with "Cannot read properties of undefined (reading 'config')".

## Reporting rules
- Full report goes to `docs/reports/TASK_NN_name.md`, committed in the same PR. Sections:
  1. files changed, 2. verification results, 3. what the owner must do manually,
  4. plain-language explanation (what and why), 5. deviations from the task and why, 6. open questions,
  7. self-review (the output of the `task-reviewer` subagent and what was done about each finding).
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
