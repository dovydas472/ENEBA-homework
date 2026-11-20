# Report – Task 01: Project skeleton

> **Reconstructed** from the chat report written at the time of the task (commit `9cbecab`). Not written in the repo at the time.

Task file: [`../tasks/TASK_01_project_skeleton.md`](../tasks/TASK_01_project_skeleton.md)

## 1. Files changed
`api/index.go`, `internal/server/{router,health,respond}.go` (later moved to `pkg/server/`, see Task 01b), `cmd/local/main.go`,
`src/{main.tsx,App.tsx,vite-env.d.ts}`, `index.html`, `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig{,.app,.node}.json`,
`go.mod`, `vercel.json`, `.gitignore`, `.env.example`, `README.md`, `docs/PAAISKINIMAI_LT.md`, `ai-logs/.gitkeep`.

## 2. Verification results
- `go build ./...` and `go vet ./...` passed; `npm run build` passed.
- `curl localhost:8080/api/health` → `200 {"status":"ok"}` with `Content-Type: application/json`.
- `curl localhost:8080/api/nope` → `404` JSON. `POST /api/health` → `405` JSON.
- `/api/health` through the Vite proxy (`:5173`) worked.
- The page showing "API: ok" was not observed in a browser at that time (only via curl on the proxy). Not verified on Vercel at that time.

## 3. What the owner must do manually
- Deploy to Vercel and test `/api/health`, `/api/nope` and a SPA route such as `/foo`.
- Install Go 1.22+ locally (it was not installed; a toolchain in a temp folder was used for verification).

## 4. Explanation
A minimal monorepo: a Vite + React + TypeScript frontend at the repo root and a Go API. The API router lives in a shared package and is
used by two entry points: `api/index.go` (the single Vercel serverless function) and `cmd/local` (a dev server on `:8080`), so local and
production run identical logic. `vercel.json` sets `framework: vite`, region `fra1`, the `/api/(.*)` → `/api` rewrite first and the SPA
fallback to `/index.html` second. The Vite dev server proxies `/api` to the Go server.

## 5. Deviations
- `go.mod` declares `go 1.22` (the minimum), not the version of the toolchain used for verification, to keep Vercel's runtime safe.
- Added a JSON `405` for non-GET methods on `/api/health` (not requested).
- `vercel.json` uses top-level `"regions": ["fra1"]`, the documented way to set the function region.

## 6. Open questions
- Which path does Vercel deliver to the Go function after the `/api/(.*)` → `/api` rewrite? The docs suggest the original path, but this was not confirmed for Go; to be tested after deploy.
- Confirm on a real deploy that the root `go.mod` does not make Vercel pick the Go preset (`framework: vite` is set explicitly).
