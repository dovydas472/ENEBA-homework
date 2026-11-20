# ENEBA homework

## Stack
- Frontend: React + TypeScript (Vite), repo root
- Backend: Go (`net/http` ServeMux) as a single Vercel serverless function
- Database: Neon Postgres via `pgx` v5 / `pgxpool`, **pooled** connection (`-pooler` host)
- Hosting: Vercel, region `fra1` (Frankfurt)

## Run locally
Requirements: Go 1.25+ (see `go.mod`), Node 20+.

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL (Neon `dev` branch, pooled string)

# terminal 1 – Go API on :8080 (run from the repo root so .env is found)
go run ./cmd/local

# terminal 2 – Vite dev server on :5173 (proxies /api -> :8080)
npm run dev
```

Open http://localhost:5173 – the page should show `API: ok · DB: ok (NN ms)`.
Quick API check: `curl localhost:8080/api/health` →
`{"status":"ok","db":"ok","dbLatencyMs":37}` (or `503` + `{"status":"error","db":"error"}`
if the database is unreachable / `DATABASE_URL` is missing).

Tests: `go test ./...`

## Environment variables
| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API (local `.env`, Vercel project settings) | Neon **pooled** string. Local + Vercel Preview: `dev` branch. Vercel Production: `main` branch. |
| `DATABASE_URL_DIRECT` | migrations only (`cmd/migrate`; local `.env` = `dev` branch, GitHub secret `PROD_DATABASE_URL_DIRECT` = `production`) | Neon **direct** string (no `-pooler`). **Never set on Vercel.** |

`.env` is git-ignored; only `.env.example` is committed.

## Database migrations
Migrations are SQL files in `migrations/` (numbered, [goose](https://github.com/pressly/goose) format) embedded into the `cmd/migrate` binary.

```bash
# local: runs against the Neon `dev` branch (DATABASE_URL_DIRECT from .env), from the repo root
go run ./cmd/migrate status            # which migrations are applied / pending
go run ./cmd/migrate up                # apply all pending
go run ./cmd/migrate down              # roll back ONE step
go run ./cmd/migrate version           # current version
go run ./cmd/migrate create add_games  # new numbered file in migrations/ (no DB needed)
```

**Production** is migrated only by GitHub Actions (`.github/workflows/migrate-production.yml`):
automatically after a merge to `main` that touches `migrations/` or `cmd/migrate/`, or manually via
*Actions → Migrate production → Run workflow*. It needs the repository secret `PROD_DATABASE_URL_DIRECT`
(Neon `production` branch, **direct** connection string). Never run migrations against production from a laptop.

## How this project was built
Planning chat → task file → Claude Code works on a `task/NN-name` branch → PR with a report → review → merge.

- [`CLAUDE.md`](CLAUDE.md) – standing rules Claude Code follows in every session
- [`docs/tasks/`](docs/tasks/) – the task files, saved verbatim
- [`docs/reports/`](docs/reports/) – one report per task (what changed, how it was verified, open questions)
- [`ai-logs/`](ai-logs/) – exported Claude Code sessions

## Layout
- `api/index.go` – the only Vercel function; forwards to the router
- `pkg/server/` – router and handlers (health check depends on a `DBPinger` interface)
- `pkg/db/` – lazy, shared pgx connection pool
- `cmd/local/` – local dev server using the same router (loads `.env`)
- `cmd/migrate/` – goose migration runner (`up`/`down`/`status`/`version`/`create`)
- `migrations/` – numbered SQL migrations, embedded with `go:embed`
- `docs/DATA_MODEL.md` – the data model (ER diagram, tables, state machines, query sketches)
- `src/api/` – `apiFetch` client and `useApi` hook (timeout, typed errors, "waking up" signal)
- `src/` – React app
- `docs/PAAISKINIMAI_LT.md` – explanations in Lithuanian
- `ai-logs/` – exported Claude Code sessions
