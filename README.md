# ENEBA homework

## Stack
- Frontend: React + TypeScript (Vite), repo root
- Backend: Go (`net/http` ServeMux, Go 1.22+) as a single Vercel serverless function
- Database: Neon Postgres via `pgx` (pooled connection) – added in a later task
- Hosting: Vercel, region `fra1` (Frankfurt)

## Run locally
Requirements: Go 1.22+, Node 20+.

```bash
npm install

# terminal 1 – Go API on :8080
go run ./cmd/local

# terminal 2 – Vite dev server on :5173 (proxies /api -> :8080)
npm run dev
```

Open http://localhost:5173 – the page should show `API: ok`.
Quick API check: `curl localhost:8080/api/health` → `{"status":"ok"}`.

Copy `.env.example` to `.env` when the database is added (not needed yet).

## Layout
- `api/index.go` – the only Vercel function; forwards to the router
- `internal/server/` – router and handlers
- `cmd/local/` – local dev server using the same router
- `src/` – React app
- `docs/PAAISKINIMAI_LT.md` – explanations in Lithuanian
- `ai-logs/` – exported Claude Code sessions
