# Task 04 – goose migrations + production migration workflow (+ gh setup, CLAUDE.md updates)

**Model:** Sonnet · **Effort:** high

## Goal
A safe, repeatable way to change the database schema:
- locally against the Neon `dev` branch with `go run ./cmd/migrate ...`;
- against Neon `production` **only** through GitHub Actions (automatically after merge + manual button).
No tables of the data model yet – only the first migration with Postgres extensions.

## 0. GitHub CLI (one-time automation setup)
The owner works remotely from a phone, so automate as much as possible:
1. Check `gh --version`. If missing, install it: `winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements`.
2. Check `gh auth status`. If not logged in, start `gh auth login --hostname github.com --git-protocol https --web` so that the **one-time code is shown to the owner immediately** (run it in the background / read its output). The owner will open github.com/login/device on the phone and enter the code. Wait for confirmation.
3. If any of this cannot work non-interactively, stop this step, tell the owner the exact command to run with `!`, and continue with the rest of the task.

## 1. Branch
`git checkout main && git pull` → branch `task/04-migrations` → first commit: this task file verbatim as `docs/tasks/TASK_04_migrations.md`.
If `ai-logs/` contains an exported, uncommitted session log, commit it on this branch too.

## 2. Migrations folder
- `migrations/` at the repo root.
- `migrations/embed.go`: `package migrations`, `//go:embed *.sql`, exported `var FS embed.FS`. So the migration files are compiled into the binary.
- `migrations/00001_extensions.sql` (goose annotations, sequential numbering):
  - Up: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and `CREATE EXTENSION IF NOT EXISTS citext;`
  - Down: drop both `IF EXISTS`.

## 3. `cmd/migrate`
- Library: `github.com/pressly/goose/v3`, using the **Provider API** (`goose.NewProvider`) with the embedded FS, dialect postgres, and a **Postgres session locker (advisory lock)** so two runs can never migrate at the same time.
- DB access: `database/sql` with `github.com/jackc/pgx/v5/stdlib`.
- Commands: `up`, `down` (one step), `status`, `version`, `create <name>` (creates the next sequential `.sql` file in `migrations/` with Up/Down template; no DB needed).
- Env: reads `DATABASE_URL_DIRECT`. Loads `.env` with `godotenv` if the file exists (local use); in CI the variable comes from the environment.
- **Safety guard:** refuse to run if the URL host contains `-pooler` (migrations must use the direct connection – PgBouncer transaction mode has no session state, and the advisory lock needs a session). Clear error message.
- **Never print the connection string, host, user or password** – not even partially. GitHub Actions logs of this public repo are public; only the full secret value is masked there.
- Timeout via context (e.g. 2 min). Non-zero exit code on any error.
- Unit test for the guard (pooled host rejected, direct host accepted, empty URL → error). No DB in tests.

## 4. GitHub Actions: `.github/workflows/migrate-production.yml`
- Triggers: `push` to `main` with `paths: ['migrations/**', 'cmd/migrate/**']`, and `workflow_dispatch` (manual "Run workflow" button).
- `concurrency: { group: migrate-production, cancel-in-progress: false }`.
- `permissions: contents: read`.
- Steps: checkout → `actions/setup-go` with `go-version-file: go.mod` → `go run ./cmd/migrate up` → `go run ./cmd/migrate status`.
- Env: `DATABASE_URL_DIRECT: ${{ secrets.PROD_DATABASE_URL_DIRECT }}`. If the secret is missing, the job must fail with a clear message (not a confusing driver error).

## 5. Verify locally (Neon `dev` branch only)
- `go build ./...`, `go vet ./...`, `go test ./...`, `npm run build` pass.
- `go run ./cmd/migrate status` → `up` → `status` (00001 applied) → `down` → `up` again. Show the outputs in the report.
- Run `up` twice in parallel (two terminals / background) → one waits for the lock, no errors, no double apply.
- Guard: run with a fake `-pooler` URL → refused.
- `go run ./cmd/migrate create test_name` creates `00002_test_name.sql` – **then delete that file** (it was only a check).
- Confirm nothing in the output reveals host/user/password.
- Do NOT run anything against the `production` branch.

## 6. `CLAUDE.md` updates
Add / change (keep it concise):
- **Verified on Vercel (do not re-question):** `/api/(.*)` rewrite works with the router; Go 1.25 builds on Vercel – do not lower the `go` directive; functions run in `fra1`; Preview deployments use the Neon `dev` branch, Production uses `production`.
- `godotenv` is allowed only in `cmd/*` tools (`cmd/local`, `cmd/migrate`), never in `api/` or `pkg/`.
- **Migration rules:** create new migrations only with `go run ./cmd/migrate create <name>`; never edit a migration that has been merged – add a new one; migrations must be backward compatible with the currently deployed code (expand/contract: add first, remove later), because Vercel deploy and the production migration run at the same time; never run migrations against `production` locally – production is migrated only by the GitHub Actions workflow.
- **Workflow:** after opening the PR, print the PR URL in the chat. If an exported session log is uncommitted in `ai-logs/`, commit it on the current task branch.

## 7. Docs
- README: short "Database migrations" section (local commands; production = GitHub Actions after merge or manual run).
- `docs/PAAISKINIMAI_LT.md` (Lithuanian), each with *ką daro, kodėl taip, ko gali paklausti pokalbyje*:
  - what a migration is, why numbered files, why goose;
  - why migrations are embedded (`go:embed`);
  - advisory lock – what it protects against;
  - why direct and not pooled for migrations;
  - why production is migrated only from CI; why the host is never printed (public logs);
  - expand/contract – why migrations must be backward compatible.

## Out of scope
- No data model tables, no seed data.
- No changes to `api/`, `pkg/server`, `pkg/db`, `src/`.

## Report
Full report in `docs/reports/TASK_04_migrations.md` (sections per `CLAUDE.md`), short summary + PR URL in chat.
In "what the owner must do manually", list exactly: the GitHub secret to create, and how to check the first workflow run.
