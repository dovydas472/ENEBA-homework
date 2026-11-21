# Task 10b – Backend hardening: cold-start retry, strict test DB in CI, 500 vs 503

**Model:** Sonnet · **Effort:** high
**Runs in parallel with Task 10.** Another session is working in the main folder, so work in a separate git worktree:
```
git worktree add ../ENEBA-homework-10b -b task/10b-backend-hardening origin/main
```
Do everything there. Remove the worktree after the PR is opened. Touch only Go code, `ci.yml` and docs – no `src/` files.

## 1. Cold-start retry (owner decision)
Observed: the first request to a Preview after a long idle returned `503` (Vercel cold start + Neon compute resume together took longer than the timeouts). Fix:
- When acquiring the **first** connection fails with a connection/timeout error, retry **once** after a short delay (e.g. 300–500 ms), within the request's context deadline. No retry for SQL errors, and never retry a statement that may have been executed.
- Review the timeouts (`ConnectTimeout`, health ping timeout, catalog request timeout) so that one retry fits inside a reasonable total (aim ≤ 10 s) – explain the numbers.
- Unit-test the retry decision (which errors are retried) without a real DB.

## 2. Strict test DB in CI
- `pkg/testdb`: if `REQUIRE_TEST_DB=1` and `TEST_DATABASE_URL` is empty → `t.Fatal` instead of `t.Skip`.
- `ci.yml` `migrations` job: set `REQUIRE_TEST_DB=1`. The `go` job keeps skipping (no DB there).
- Prove it in the report: CI log shows the integration tests ran (use `-v` for the catalog package in that job, or a summary line).

## 3. 500 vs 503
- `503` only when the database is unreachable/unavailable (connection errors, pool/config errors, timeouts while connecting).
- `500` for any other unexpected error (e.g. a SQL error = a bug). Same generic JSON body (`{"error":"internal error"}`), `no-store`, real cause only in the server log.
- Handler tests for both cases.

## 4. Docs
`docs/PAAISKINIMAI_LT.md`: why exactly one retry and only for connection errors; why `REQUIRE_TEST_DB` exists (a silently skipped test is worse than a failing one); 500 vs 503 meaning (who should act: developer vs infrastructure).

## Report
Standard workflow from `CLAUDE.md` (`task/10b-backend-hardening`, task file first, self-review, PR with filled template, CI green). Export the session log at the end and commit it on this branch.
