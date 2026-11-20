# Task 01b – Fix Vercel build: internal package import

**Model:** Sonnet · **Effort:** high

## Problem
Vercel build fails:
```
package command-line-arguments
	imports handler/api
	index.go:9:2: use of internal package github.com/dovydas472/ENEBA-homework/internal/server not allowed
```
Vercel compiles `api/index.go` as a separate package (`handler/api`), so Go's `internal/` import rule blocks it.

## Decision (already made)
Rename `internal/` → `pkg/`. So `internal/server` becomes `pkg/server`. Logic still lives outside `/api`; `api/index.go` only forwards the request.

## Do
1. Move `internal/server` → `pkg/server` (use `git mv` to keep history).
2. Update imports in `api/index.go` and `cmd/local/main.go`.
3. Update all references to `internal/` in `README.md`, `docs/PAAISKINIMAI_LT.md` and code comments.
4. In `docs/PAAISKINIMAI_LT.md` add a short section (Lithuanian): why `pkg/` and not `internal/` – what Go's `internal` rule is and why Vercel's build breaks it. This is a likely interview question.
5. Make sure nothing else changes.

## Verify
- `go build ./...` and `go vet ./...` pass.
- `go run ./cmd/local` → `curl localhost:8080/api/health` returns `{"status":"ok"}`.
- No remaining `internal/` references: search the repo.

## Do NOT
- No other refactoring, no new features.
- Commit locally, do not push.

## Report
1. Files changed.
2. Verification results.
3. Plain-language explanation of the fix.
4. Any deviation from this task.
