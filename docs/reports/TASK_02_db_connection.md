# Report – Task 02: Database connection (Neon + pgx) and health check

> **Reconstructed** from the chat report written at the time of the task (commit `e1e3f36`). Not written in the repo at the time.

Task file: [`../tasks/TASK_02_db_connection.md`](../tasks/TASK_02_db_connection.md)

## 1. Files changed
- New: `pkg/db/db.go`, `pkg/server/health_test.go`, `src/api/client.ts`, `src/api/useApi.ts`, `go.sum`.
- Changed: `pkg/server/{router,health}.go`, `api/index.go`, `cmd/local/main.go`, `src/App.tsx`, `go.mod`, `.env.example`, `README.md`, `docs/PAAISKINIMAI_LT.md`.

## 2. Verification results
- `go build ./...`, `go vet ./...`, `go test ./...` passed (table-driven health test with a fake `DBPinger`, including a check that the error text and connection string never appear in the response). `npm run build` passed.
- Valid local `.env` (Neon `dev` branch): `/api/health` → `200 {"status":"ok","db":"ok","dbLatencyMs":...}` (≈1 s on the first call, ≈40 ms with a warm pool). Headless Edge showed "API: ok · DB: ok (NN ms)".
- `DATABASE_URL` removed: API starts, `/api/health` → `503 {"status":"error","db":"error"}`; page shows "API: ok · DB: error" + Retry; after restoring the variable and restarting, Retry showed DB ok.
- Invalid and unreachable DB URLs (with a fake password) → 503; the password appeared in neither the response nor the log.
- API down → page shows "API: error" + Retry. A deliberately slow fake API showed "Checking…" → "Waking up the server…" → result.
- `.env` is not tracked; no real credentials in the staged diff.

## 3. What the owner must do manually
- Set `DATABASE_URL` in Vercel: Production = Neon `main` pooled string, Preview = Neon `dev` pooled string. Do not set `DATABASE_URL_DIRECT` on Vercel.
- Go 1.25+ is now needed locally (see deviations).
- Push, then test `/api/health` on the deployed URL.

## 4. Explanation
`pkg/db` creates one `pgxpool` lazily (once per process) and reuses it, so a warm Vercel instance does not reconnect on every request.
Pool settings are small and serverless-friendly (`MaxConns` 4, `MaxConnIdleTime` 30 s, `ConnectTimeout` 5 s); pgx defaults are kept
for PgBouncer compatibility. The health handler depends on a small `DBPinger` interface, so tests use a fake instead of a database. It pings
with a 5 s timeout and returns 200 with the latency, or 503 with a generic body (the real error is only logged). `NewRouter(Deps{...})`
receives its dependencies as a parameter. `godotenv` is used only in `cmd/local`. On the frontend, `apiFetch` handles JSON, typed
`ApiError`s and a 15 s timeout; the `useApi` hook adds `loading`, `slow` (after 1.5 s), `error`, `data` and `retry`.

## 5. Deviations
- `go.mod` is now `go 1.25.0` instead of 1.22: pgx v5.13.0 and `golang.org/x/text` require Go 1.25.
- Added a "db is nil → 503" case to the health test (beyond the two requested).
- The UI was verified with a throw-away headless-Edge script kept outside the repo.

## 6. Open questions
- Does Vercel's Go runtime support Go 1.25 (it reads the version from `go.mod`)? If the build fails on the Go version, pin an older pgx and a lower `go` directive.
- The rewrite-path question from Task 01 is still untested on a real deploy.
