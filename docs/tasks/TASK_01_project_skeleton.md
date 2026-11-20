# Task 01 – Project skeleton + first Vercel deploy (no database yet)

**Model:** Sonnet · **Effort:** high

## Goal
Create a minimal monorepo that runs locally and can be deployed to Vercel as ONE project:
React + TypeScript frontend (Vite) at the repo root and a Go API served from a single Vercel function.
After this task, `/api/health` must work both locally and on Vercel. No database code in this task.

## Architecture decisions (already made – do not change them)
- **A.** Vercel Go "serverless functions" model: one file `api/index.go` + `vercel.json` rewrites. Do NOT use the newer Go server / Vercel Services model.
- **B.** Frontend lives at the repo root. `api/index.go` only forwards the request; all Go logic goes into `internal/`.
- **C.** Router: standard library `net/http` `ServeMux` (method + path patterns, e.g. `GET /api/health`). No chi, gin or other router libraries.
  **Important:** `go.mod` must declare Go **1.22 or newer** (use the locally installed version if newer). Without it, routes with `{id}` will not work.
- **D.** Database driver will be `pgx` (next task). **Important:** we will use the Neon **pooled** connection string (host contains `-pooler`), because serverless functions open many short connections. Migrations: numbered `.sql` files + a small Go tool – final decision in a later task. In this task only add the `.env.example` placeholder (see below).
- **E.** Region: Frankfurt. Vercel functions region `fra1`.

## Required structure
```
/api/index.go            # package handler; exported Handler func; only calls internal router
/internal/server/        # router + handlers (e.g. router.go, health.go)
/cmd/local/main.go       # local dev server on :8080 using the SAME router
/src/                    # React app (Vite + TS)
index.html, package.json, vite.config.ts, tsconfig*.json
go.mod (+ go.sum if any)
vercel.json
.gitignore
.env.example
README.md
docs/PAAISKINIMAI_LT.md
ai-logs/.gitkeep
```

## Details

### Go API
1. `go.mod` at the repo root. Module path: take it from the git remote if one exists, otherwise use a placeholder and tell me in the report.
2. `internal/server`: a function like `NewRouter() http.Handler` that registers:
   - `GET /api/health` → `200`, JSON `{"status":"ok"}`, header `Content-Type: application/json`.
   - Unknown `/api/...` paths → `404` with a JSON error body (not HTML).
3. `api/index.go`: `package handler`, exported `Handler(w, r)` that passes the request to the router. Nothing else in this file.
   Keep `api/index.go` the **only** `.go` file in `/api` (every `.go` file there becomes a separate Vercel function).
4. `cmd/local/main.go`: starts the same router on port 8080 for local development.
   Do NOT put a `main.go` in the repo root, `cmd/api/` or `cmd/server/` – Vercel's Go preset auto-detects those paths and would switch to a different deploy model.
5. Check how the request path reaches the function after the Vercel rewrite (original path `/api/health` vs rewritten path). The router must work with what Vercel actually delivers. If you are not sure, say so in the report, and I will test it after deploy.

### Frontend
1. Vite + React + TypeScript, at the repo root.
2. `vite.config.ts`: dev proxy `/api` → `http://localhost:8080`.
3. `App.tsx`: on load, call `/api/health` and show one line: "API: ok" / "API: error". Plain, no styling work, no extra libraries.

### vercel.json
- `"framework": "vite"` set explicitly (the root `go.mod` must not make Vercel pick the Go preset).
- Rewrite `/api/(.*)` → `/api` (the single Go function).
- SPA fallback: everything else → `/index.html` (needed later for client-side routes). The API rewrite must come first.
- Functions region `fra1`.

### Other files
- `.gitignore`: `node_modules`, `dist`, `.env`, `.env.*` (but NOT `.env.example`), `.vercel`, Go build binaries.
- `.env.example`: `DATABASE_URL=` with a one-line comment saying to use the Neon **pooled** connection string (`-pooler` host). Never put a real value anywhere in the repo.
- `README.md`: project title, stack, how to run locally (two terminals: Go API + Vite). Short. More sections later.
- `ai-logs/.gitkeep`: folder for exported Claude Code sessions.

## Out of scope (do NOT do)
- No database code, no `pgx` yet.
- No styling, no routing library, no state management, no extra npm/Go dependencies beyond what Vite's React-TS template needs.
- No `git push`, and do not change git remotes. You may `git init` and make a local commit.

## Verify before reporting
- `go build ./...` and `go vet ./...` pass.
- `npm run build` passes.
- Local: `go run ./cmd/local` + `npm run dev` → page shows "API: ok".
- `curl localhost:8080/api/health` → `{"status":"ok"}`; `curl localhost:8080/api/nope` → 404 JSON.

## Explanations (required)
1. Short English comments in code at the important functions (router, handler, `api/index.go`, local main).
2. `docs/PAAISKINIMAI_LT.md` (in Lithuanian): for each important file/function – **ką daro, kodėl taip, ko gali paklausti pokalbyje**. Must cover: why one Vercel function + rewrite, why logic is in `internal/`, why `cmd/local` exists, why Go ≥ 1.22, why the pooled connection string.

## Report format (at the end)
1. Files created (list).
2. How to run locally (exact commands).
3. What I should test manually.
4. Plain-language explanation of what you did and why (as if explaining to a junior developer).
5. Any deviation from this task, and why.
6. Open questions / things you were unsure about (especially point 5 of "Go API").
