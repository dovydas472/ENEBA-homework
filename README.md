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
| `DATABASE_URL_DIRECT` | migrations only (later task) | Neon direct string. **Never set on Vercel.** |

`.env` is git-ignored; only `.env.example` is committed.

## Layout
- `api/index.go` – the only Vercel function; forwards to the router
- `pkg/server/` – router and handlers (health check depends on a `DBPinger` interface)
- `pkg/db/` – lazy, shared pgx connection pool
- `cmd/local/` – local dev server using the same router (loads `.env`)
- `src/api/` – `apiFetch` client and `useApi` hook (timeout, typed errors, "waking up" signal)
- `src/` – React app
- `docs/PAAISKINIMAI_LT.md` – explanations in Lithuanian
- `ai-logs/` – exported Claude Code sessions
