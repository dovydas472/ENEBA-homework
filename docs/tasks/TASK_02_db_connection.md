# Task 02 – Database connection (Neon + pgx) and health check

**Model:** Sonnet · **Effort:** high

## Goal
The Go API connects to Neon Postgres. `/api/health` reports API and DB status separately.
The frontend gets a reusable API client that shows a "waking up" state when a request is slow.
No tables, no migrations in this task.

## Context (decisions already made – do not change)
- Driver: `pgx` v5 with `pgxpool`.
- The app uses the Neon **pooled** connection string (`-pooler` host) from env `DATABASE_URL`.
  Neon's pooler is PgBouncer in **transaction mode**: no session state (`SET`, `LISTEN`, SQL-level `PREPARE`). pgx's default protocol-level prepared statements ARE supported, so keep pgx defaults.
  Migrations (later task) will use the **direct** string in a separate env var `DATABASE_URL_DIRECT`, which is never set on Vercel.
- Neon branches: `main` = production (Vercel Production), `dev` = local development (local `.env`, Vercel Preview).
- Neon free compute suspends when idle; the first query after a pause can take noticeably longer. That is the main reason for the "waking up" UI.
- Logic lives in `pkg/`, `api/index.go` only forwards, local server in `cmd/local`.

## Backend

### 1. `pkg/db` – connection pool
- One pool per process, created lazily on first use (e.g. `sync.Once`) and reused across requests. Vercel can reuse a warm function instance, so a package-level pool saves reconnecting on every request.
- Read `DATABASE_URL`. If missing → return a clear error (no panic, no crash of the whole function).
- Pool settings (explain each one in comments and in the Lithuanian doc):
  - small `MaxConns` (e.g. 4) – many function instances × pool size all hit Neon;
  - short `MaxConnIdleTime` – idle serverless instances get frozen, stale connections should not linger;
  - connect timeout via context.
- **Never log or return the connection string or the raw driver error to the client.** Log the error server-side; return a generic message.

### 2. Health check design
- The health handler must NOT depend on `pgxpool` directly. Define a small interface in the handler's package, e.g. `type DBPinger interface { Ping(ctx context.Context) error }`, and inject it when building the router. This makes the handler testable without a real database.
- `GET /api/health`:
  - DB ping with a context timeout (~5 s, to survive a Neon cold start).
  - All OK → `200` `{"status":"ok","db":"ok","dbLatencyMs":<int>}`
  - DB down or not configured → `503` `{"status":"error","db":"error"}`
- `NewRouter` receives its dependencies as parameters (no globals inside handlers). `api/index.go` and `cmd/local/main.go` both build the same dependencies and pass them in.

### 3. Local env loading
- `cmd/local/main.go` loads `.env` from the repo root using `github.com/joho/godotenv` (only in `cmd/local`, never in `api/` or `pkg/`). On Vercel, env vars come from project settings.
- Update `.env.example`:
  ```
  # Neon pooled connection string (host contains -pooler). Local: use the `dev` branch.
  DATABASE_URL=
  # Neon direct connection string (no -pooler). Only for migrations, never set on Vercel.
  DATABASE_URL_DIRECT=
  ```

### 4. Test
- `pkg/server` (or wherever the health handler is): table-driven test with a fake `DBPinger`:
  1. ping OK → 200 + `db: ok`;
  2. ping returns error → 503 + `db: error`, and the error text is NOT in the response body.
- Use `net/http/httptest`. No real database in tests.

## Frontend

### 5. Reusable API client `src/api/client.ts`
- One function (e.g. `apiFetch<T>(path, options)`) that every future API call will use.
- Handles: JSON parsing, non-2xx → typed error, request timeout (abort after ~15 s).
- Exposes a "slow" signal: if the request takes longer than **1.5 s**, the UI can show "Waking up the server…".
  Choose the simplest clean way (e.g. a small React hook `useApi` that returns `{ data, error, loading, slow, retry }`). Explain the choice.

### 6. `App.tsx`
- Uses the hook to call `/api/health` and shows:
  - loading → "Checking…"
  - slow → "Waking up the server, this can take a few seconds…"
  - ok → "API: ok · DB: ok (NN ms)"
  - error → "API: ok · DB: error" (or "API: error" if the request itself failed) + a **Retry** button
- Plain, no styling work. This page will be replaced by the homepage later; the client + hook stay.

## Out of scope
- No tables, no migrations, no goose yet.
- No styling, no router library.
- No `git push`. Local commit only.

## Verify
- `go build ./...`, `go vet ./...`, `go test ./...` pass.
- `npm run build` passes.
- With a valid local `.env` (dev branch): page shows "DB: ok".
- With `DATABASE_URL` removed: API still starts, `/api/health` returns 503 JSON, page shows the error state and Retry works after restoring the variable and restarting.
- `git status`: `.env` is NOT tracked.

## Explanations (required)
- Short English comments at: pool creation, each pool setting, `DBPinger` interface, health handler, `apiFetch`, the hook.
- `docs/PAAISKINIMAI_LT.md` (Lithuanian) – new sections, each with **ką daro, kodėl taip, ko gali paklausti pokalbyje**:
  - pooled vs direct connection, PgBouncer transaction mode;
  - why one lazy package-level pool in serverless, and each pool setting;
  - why the handler depends on an interface (dependency injection, testing);
  - why 503 and why the raw error is hidden from the client;
  - why `godotenv` only in `cmd/local`;
  - how the "slow / waking up" signal works.

## Report format
1. Files created/changed.
2. Verification results (each item from "Verify").
3. What I must do manually (env vars, etc.).
4. Plain-language explanation of what you did and why.
5. Deviations from this task, and why.
6. Open questions.
