# Report – Task 04: goose migrations + production migration workflow

Task file: [`../tasks/TASK_04_migrations.md`](../tasks/TASK_04_migrations.md)
Branch: `task/04-migrations` (from `main` at `fbdbd33`, after the merge of PR #1)

## 1. Files changed
- New: `docs/tasks/TASK_04_migrations.md` (verbatim, first commit).
- New: `migrations/embed.go` (`go:embed *.sql`, exported `FS`), `migrations/00001_extensions.sql` (`pg_trgm`, `citext`; Down drops both `IF EXISTS`).
- New: `cmd/migrate/main.go` (commands, goose Provider, advisory lock), `cmd/migrate/helpers.go` (guard `checkDirectURL`, `safeMessage`, `createMigration`), `cmd/migrate/main_test.go` (no DB).
- New: `.github/workflows/migrate-production.yml`.
- Changed: `go.mod` / `go.sum` (+ `github.com/pressly/goose/v3 v3.27.0` and its 3 indirect deps; the `go` directive is still `1.25.0`), `CLAUDE.md`, `README.md` (new "Database migrations" section, layout, env table), `docs/PAAISKINIMAI_LT.md` (6 new sections, `godotenv` heading updated).
- New: `ai-logs/2026-11-20_01_workflow.md` (regenerated, whole session) and `ai-logs/2026-11-19_01_skeleton-db.md` / `…_workflow.md` with the organisation name replaced by `[REDACTED]`; `CLAUDE.md` "AI logs" got the remote-export procedure.
- No changes in `api/`, `pkg/`, `src/` (`git diff --stat main -- api pkg src` is empty).

## 2. Verification results
Against the Neon **`dev`** branch only (nothing was run against `production`):

| Check | Result |
|---|---|
| `go build ./...`, `go vet ./...`, `gofmt -l cmd migrations` | pass / clean |
| `go test ./...` | pass (`cmd/migrate`: guard, secret scrubbing, `create`; `pkg/server`) |
| `npm run build` | pass |
| `go.mod` `go` directive | still `go 1.25.0` |

Migration cycle (`status` → `up` → `status` → `up` → `down` → `status` → `up` → `version`):
```
status   00001_extensions.sql                     pending
up       applied  00001_extensions.sql (316ms)
status   00001_extensions.sql                     applied 2026-11-20 08:30:59 UTC
up       nothing to apply: database is up to date
down     rolled back  00001_extensions.sql (230ms)
status   00001_extensions.sql                     pending
up       applied  00001_extensions.sql (267ms)
version  current version: 1
```
Parallel run (after a `down`, three `up` processes started at the same moment):
```
run a: applied  00001_extensions.sql (240ms)          exit=0
run b: nothing to apply: database is up to date        exit=0
run c: nothing to apply: database is up to date        exit=0
```
One process applied the migration, the other two waited for the advisory lock and then found nothing to do: no errors, no double apply.

Guard and error handling:
```
fake "-pooler" URL -> error: DATABASE_URL_DIRECT points to the POOLED connection (host contains "-pooler"); migrations need the DIRECT connection   (exit 1)
empty variable     -> error: DATABASE_URL_DIRECT is empty or not set (locally: add it to .env; in CI: set the GitHub secret)                          (exit 1)
unreachable host   -> error: cannot connect to the database (details hidden on purpose; check DATABASE_URL_DIRECT)                                   (exit 1)
unknown command    -> error: unknown command "bogus" + usage                                                                                          (exit 1)
```
`go run ./cmd/migrate create test_name` created `migrations/00002_test_name.sql` (Up/Down template) – **deleted afterwards**; `git status` shows only intended changes.

Secret check: a script read the real host, endpoint id, user, password and database name from `.env` and searched the combined output of `status`, `up`, `version`, `down`, `up`, an unknown command and a failed connection for them – **none found** (values were never printed). Secret search over the branch diff: only fake test values (`user:pw@…`, `alice:hunter2@…`) in `main_test.go`.

Not verifiable here: the GitHub Actions workflow itself (it only runs on GitHub; YAML parses, triggers read back as `push` + `workflow_dispatch`).

## 3. What the owner must do manually
1. **Create the GitHub secret BEFORE merging the PR** (otherwise the first automatic run fails – with a clear message, and you would just re-run it):
   GitHub → repo → *Settings → Secrets and variables → Actions → New repository secret*
   - Name: `PROD_DATABASE_URL_DIRECT`
   - Value: the Neon **`production`** branch connection string, **direct** (in the Neon console: *Connect* → branch `production` → switch **Connection pooling off** → the host must **not** contain `-pooler`).
   (GitHub mobile app can't edit secrets – use the browser on the phone.)
2. **Open the PR** (see section 6; `gh` is not installed): https://github.com/dovydas472/ENEBA-homework/pull/new/task/04-migrations
3. **Check the first workflow run** after the merge: *Actions → "Migrate production"*. It starts automatically (the merge touches `migrations/**`). Expected: green run; step "Apply migrations" prints `applied  00001_extensions.sql (…)`, step "Show migration status" prints `00001_extensions.sql … applied <time>`. If the secret is missing the first step fails with "GitHub secret PROD_DATABASE_URL_DIRECT is not set" – add it and use *Run workflow* (*Actions → Migrate production → Run workflow → branch `main`*). A second run must say "nothing to apply".
   Optional proof in the Neon SQL editor (branch `production`): `select version_id, is_applied from goose_db_version;`.
4. Optional, to automate PRs later: install and log in to `gh` (see section 6).

## 4. Plain-language explanation
A **migration** is a numbered SQL file that changes the database structure; goose remembers which files were already applied, so every environment ends up with the same schema by running the same steps in order. The files are compiled into the `cmd/migrate` program (`go:embed`), so the tool always carries exactly the migrations of the code it was built from.

`cmd/migrate` has five commands (`up`, `down` = one step back, `status`, `version`, `create <name>`). Before changing anything it takes a Postgres **advisory lock**, so two runs can never migrate at once (the second waits). Because that lock lives in one database session, the tool refuses a **pooled** connection (host with `-pooler`) and requires the **direct** one.

**Production** is changed only by GitHub Actions: automatically after a merge to `main` that touches the migrations or the tool, or by hand with the "Run workflow" button; the connection string is a GitHub secret. The repo is public, so its Actions logs are public too, and GitHub hides only the *whole* secret value – not its parts. That is why the tool never prints host, user or password, replaces driver errors by generic messages and additionally scrubs the host, user, password and IP addresses from any remaining error text.

Because Vercel's deploy and the production migration run at the same time, every migration must be **backward compatible** with the code that is live (expand first, contract later).

## 5. Deviations from the task and why
- **`gh` was not installed or authenticated (step 0):** `winget install --id GitHub.cli …` was denied by the permission system in this session, so I did not retry or work around it (step 0.3). Consequence: no PR opened by me; commands for you are in section 6.
- **goose pinned to `v3.27.0`, not "latest":** `go get …@latest` (v3.30.1) raised the `go` directive from 1.25.0 to 1.26.0, which is not verified on Vercel and `CLAUDE.md` forbids changing it. I reverted and picked the newest goose version that leaves `go 1.25.0` untouched (v3.27.0; v3.26.0 also works).
- **Workflow additions (beyond the task text):** `branches: [main]` on the `push` trigger (the task says "push to main"), `timeout-minutes: 10`, and actions pinned to **commit SHAs** (`actions/checkout` v4.4.0, `actions/setup-go` v5.6.0) instead of mutable tags – the job holds the production credential. The "missing secret" check is a separate first step with a `::error::` annotation; the Go tool also rejects an empty variable.
- **Connection errors are fully generic** (`cannot connect to the database (details hidden…)`) – pgx connection errors contain `host=… user=…`. This costs some debuggability; the trade-off follows from "never print the host" in a public log.
- **`create` is stricter than the spec:** names must be snake_case (`[a-z0-9_]`), the file is never overwritten, and it must be run from the repo root.
- **Extra tests** beyond the required guard test: secret scrubbing (`safeMessage`) and `create`.
- **AI-log addendum:** done as requested (regenerated log, `[REDACTED]` replacements, `CLAUDE.md` procedure). The regenerated log contains the full earlier session (Tasks 01–03) as before; the Task 04 session itself is not included (it is still running at commit time).

## 6. Open questions
- OK to install the GitHub CLI yourself so later tasks can open PRs and push? In a terminal (or with `!` in Claude Code):
  ```
  winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements
  gh auth login --hostname github.com --git-protocol https --web
  ```
  (a one-time code appears; enter it at github.com/login/device on the phone). PR for this branch, if you prefer the CLI to the browser link:
  ```
  gh pr create --base main --head task/04-migrations --title "Task 04: goose migrations + production migration workflow" --body-file .github/pull_request_template.md
  ```
- The branch protection / required checks are not configured; the workflow will run on any push to `main` touching the paths. Fine for now?
- Should the `dev` Neon branch also be migrated automatically (e.g. on PRs)? Currently only manually from the laptop – not part of this task.
