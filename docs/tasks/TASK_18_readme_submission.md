# Task 18 – Final README, interview cheat sheet, submission checks

**Model:** Opus · **Effort:** high
The last task. Start after Task 17 is merged. No code changes except tiny fixes found by the checks (list them).

## Goal
The README is the first thing the reviewers read. It must let them understand **what was built, why, how to check it, and how AI was used** in a few minutes – honestly, with links to the evidence.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/18-readme`).

## 2. README.md – structure (rewrite; keep the existing disclaimer block at the very top verbatim)
1. **Title + one-line summary**, the **live URL** (`https://enehomeworkba.vercel.app`), "Sign in as demo user" hint, and a note that the first request after idle can take a few seconds (cold start; the UI shows "Waking up the server…").
2. **Screenshots** (from `docs/screenshots/`): desktop home, store, product, cart/payment, order with keys; one phone row.
3. **The assignment, part by part** – a table: requirement → how it is met → where to look (page + main files). Store, Homepage (block registry, per-block endpoints, content in the DB, "could be split into services"), Search, Product page, Checkout, Authentication, Eneba styling (parity process, what is intentionally not copied and why).
4. **The two parts done in depth:**
   - **Purchase flow** – short sequence diagram (Mermaid): cart → quote → create order (reserve keys with `SKIP LOCKED`, 15 min) → pay (mock Success/Decline) → keys; idempotency, lazy expiry, unpaid-order cap, other user's order = 404, the two-buyers/last-key test.
   - **Search** – IGDB aliases, `ILIKE` + `word_similarity` (threshold 0.55 tuned with a query table), 2-letter word-start rule, relevance ranking, suggestions one per game, combobox accessibility.
5. **Architecture** – Mermaid diagram (browser → Vercel CDN → Go function `fra1` → Neon Postgres pooled; GitHub Actions → migrations/seed via direct connection); main decisions with one-line reasons (Go on Vercel functions, `pkg/` not `internal/`, pgx + hand-written SQL, goose, TanStack Query, CSS Modules + tokens, cookies + argon2id). Link `docs/DATA_MODEL.md`, `docs/DESIGN.md`.
6. **Quality** – CI jobs (Go, migrations up/down on clean Postgres, integration tests with the deterministic seed, frontend lint/test/build), number of Go and frontend tests (count them), axe/Lighthouse results, security notes (CSRF Origin check, rate limit, no card fields, noindex, secrets never in the repo).
7. **Scope and shortcuts (honest list)** – simulated payment; no email verification / password reset; per-email rate limit trade-off (+ production option email + IP); no demo-account clean-up; block "services" are logical, not separate deployments; EUR only; key codes not encrypted at rest (production would); a second pending order when going back from payment (limited by the cap); anything else the reports list as known limitations. Also the features **intentionally not built** (wishlist, cashback, reviews, …).
8. **Run it locally** – prerequisites, `.env` from `.env.example`, `go run ./cmd/migrate up`, `go run ./cmd/seed`, `go run ./cmd/local`, `npm run dev`, tests (incl. `TEST_DATABASE_URL`).
9. **How this project was built with AI** – the workflow: planning chat (strategy, task files, reviews against the task and the code) → task file in `docs/tasks/` → Claude Code on a branch → PR with report in `docs/reports/` + self-review subagent → CI → owner tests the Preview and merges. Numbers: tasks, PRs, commits (count them). Where to find: `CLAUDE.md`, `docs/tasks/`, `docs/reports/`, `ai-logs/` (Claude Code sessions, redacted), and **the planning chat: `<SHARE_LINK>`** (placeholder – the owner fills it in at submission). One short paragraph on what the human did (decisions, testing, reviews) vs. what the AI did.
10. **About the author** – keep the section from Task 15.
11. **Credits** – IGDB (data provided by IGDB), Metropolis font (Unlicense), lucide icons (ISC), Innert art (used with the author's permission).

Keep it scannable: short paragraphs, tables, collapsible `<details>` for long parts. English.

## 3. Interview cheat sheet (Lithuanian)
At the **top** of `docs/PAAISKINIMAI_LT.md` add a section **"Svarbiausi klausimai pokalbiui"**: ~25 likely questions with a 2–4 sentence answer each and a link to the detailed section below. Cover at least: architecture overview in 60 seconds; why Go on Vercel functions; `pkg/` vs `internal/`; pooled vs direct connection; migrations and expand/contract; data model (game → product → offer → key); money in cents; how stock/cheapest price are derived; `SKIP LOCKED` and the last-key test; idempotency; reservation expiry; why 404 for other users' orders; search (trigram, aliases, threshold, word starts); facet counts that follow filters; caching (`s-maxage`, why safe); auth (argon2id, cookie flags, token hash, CSRF, rate limit); TanStack Query and prefetch; URL as the source of truth for filters; accessibility work; how AI was used and how you checked its work; what you would do next with more time.

## 4. Submission checks (report each)
- Every link in the README works (relative links and the live URL); Mermaid diagrams render on GitHub.
- Production smoke test: home, search ("witchr 3", "gta"), store filters, product, add to cart, demo sign-in, checkout decline → success, keys, orders – on desktop and a phone size.
- `ai-logs/` complete for all tasks (list any missing session) and contain no secrets/emails (scan).
- No secrets in the repo history (`git log -p` scan for connection strings, `npg_`, IGDB credentials, emails other than noreply).
- `robots.txt` / `noindex` still in place; demo banner on every page.

## Report
As defined in `CLAUDE.md` (incl. Self-review). Export the session log at the end and commit it on this branch.
