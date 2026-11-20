# Task 08 – IGDB snapshot + deterministic seed data (+ demo safety basics)

**Model:** Sonnet · **Effort:** high
Start after Task 05 (data model) is merged. Do not run in parallel with Task 07 (both edit `CLAUDE.md`/`README.md`).

## Goal
Realistic catalog data in both Neon branches:
1. A one-time **IGDB snapshot** of ~50 real games, committed as JSON (IGDB credentials never leave the owner's PC).
2. A **deterministic seed tool** that builds platforms, regions, products, sellers, offers and keys from that snapshot.
3. A manual GitHub Actions workflow to seed **production**.
Plus small demo-safety basics (phishing-risk mitigation from the research).

## Decisions (made by the owner – do not change)
- Data source: **IGDB** (Twitch API), non-commercial use, attribution "Data provided by IGDB". Covers are shown from IGDB's image CDN (`images.igdb.com`, `t_cover_big`), built from `image_id`. Nothing is downloaded into the repo.
- IGDB credentials (`IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`) exist **only** in the local `.env`. Never in code, logs, GitHub or Vercel. The snapshot tool runs locally; the seed tool reads only the committed JSON.
- Platforms are activation services shown as **text badges** (no logos): Steam, Xbox Live, PSN, Nintendo eShop, EA App, Epic Games, GOG.com, Ubisoft Connect, Battle.net.
- Regions: GLOBAL, EUROPE, UNITED STATES, LATAM.
- Seller rating 0–10 (NULL = "New seller"); tiers are derived in code (see `docs/DATA_MODEL.md`).
- Key codes must look **obviously fake**: format `DEMO-XXXX-XXXX-XXXX` (A–Z, 0–9).
- App name: **EneHomeworkBa**.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/08-igdb-seed`).

## 2. `cmd/igdb-snapshot` (runs locally only)
- OAuth client-credentials token from Twitch (`id.twitch.tv/oauth2/token`), then one IGDB `POST /v4/games` query (Apicalypse).
- Select ~60 well-known main games (not DLC/bundles/editions; check IGDB's game type/category field), that have a cover and a summary, sorted by `total_rating_count` desc. **Exclude adult/erotic themes** (IGDB theme "Erotic") – this is a public demo.
- Fields: `id`, `name`, `slug`, `summary`, `genres.name`, `first_release_date`, `involved_companies` (developer/publisher names), `cover.image_id`, `total_rating_count`, `platforms` (ids).
- Keep the 50 best that pass the filters. Trim `summary` to max ~2 sentences / ~300 chars on a sentence boundary.
- Output: `seed/igdb_snapshot.json` (stable order, pretty-printed, with a header object: source "IGDB", fetch date, query used). Respect the rate limit (4 req/s); one or two requests are enough.
- Never print the token or the secret. Fail with a clear message if the env vars are missing.

## 3. `cmd/seed`
- Reads `seed/igdb_snapshot.json` (embedded with `go:embed` or read from disk – explain the choice) and writes the catalog in **one transaction**.
- Uses `DATABASE_URL_DIRECT` with the same `-pooler` guard and "never print host/credentials" rule as `cmd/migrate` (reuse the code; if it must be shared, put it in `pkg/`).
- **Safety:** refuses to run if the catalog tables already contain data, unless `--reset` is given. `--reset` deletes catalog data (in dependency order) and restarts identities. Print counts, never connection details.
- **Deterministic:** fixed RNG seed (`math/rand/v2`), so the same snapshot always produces exactly the same data in `dev` and `production`.
- Generation rules (put them in small pure functions with unit tests):
  - **Platform mapping** from IGDB platforms: PC → Steam (some PC games additionally GOG.com / Epic Games; EA-published → EA App instead of Steam; Ubisoft-published → Ubisoft Connect; Blizzard → Battle.net), PlayStation → PSN, Xbox → Xbox Live, Switch → Nintendo eShop.
  - **Products:** 1–3 per game (platform × region); a few popular games also get a "Deluxe" or "Game of the Year" edition. Slug like `elden-ring-steam-global`.
  - **MSRP** from release year (newer → 59.99/69.99, older → 39.99/29.99/19.99; editions higher).
  - **Sellers:** 8 fictional names (no real shop names), ratings spread over all tiers incl. one NULL ("New seller"), plausible `reviews_count`.
  - **Offers:** 2–5 per product, prices 25–90 % of MSRP, rounded to .49/.99 style; a few inactive offers.
  - **Keys:** 0–8 per offer. Make sure the data contains: offers with 0 keys, a few **products completely out of stock**, a couple of keys `reserved` with an expired `reserved_until`, and some `sold` keys (with `sold_at`).
  - `cover_url` = `https://images.igdb.com/igdb/image/upload/t_cover_big/{image_id}.jpg`; `popularity` = `total_rating_count`; `igdb_id` set.
- Bulk insert efficiently (e.g. `pgx.CopyFrom` for keys) – explain.

## 4. GitHub Actions: `.github/workflows/seed-production.yml`
- `workflow_dispatch` only, with a boolean input `reset` (default false) and a required text input `confirm` that must equal `seed-production`.
- Same structure and safety as `migrate-production.yml` (SHA-pinned actions, secret check, `concurrency`, `permissions: contents: read`). Runs `go run ./cmd/seed` (with `--reset` only if the input is true).

## 5. Demo safety basics
- `index.html`: `<title>EneHomeworkBa – internship demo</title>` and `<meta name="robots" content="noindex, nofollow">`.
- `public/robots.txt`: `User-agent: *` / `Disallow: /`.
- `README.md`: put this at the very top (verbatim):
  > **Disclaimer & Attribution:** This repository is a non-commercial portfolio and internship assignment project demonstrating marketplace UI and architecture. It is not affiliated with, endorsed by, or connected to Eneba (JSC "Helis play"). Authentication and checkout are strictly simulated – no real payments, user credentials, or digital keys are processed or issued. Game metadata and cover images are provided by IGDB under the Twitch Developer Service Agreement for non-commercial use. All product names, logos, brands and artwork remain the property of their respective owners.
- (The visible demo banner, footer attribution and demo login come with the UI tasks.)

## 6. Verify (Neon `dev` only – never production)
- Standard checks from `CLAUDE.md` + unit tests for the generation rules.
- Snapshot: show count, first 10 titles with popularity, confirm every game has a cover + summary and none has the erotic theme.
- Seed on `dev`: `go run ./cmd/seed` (should refuse because… only if data exists) → `--reset` → print counts per table.
- **Determinism:** run `--reset` twice and compare a checksum of the ordered catalog data – must be identical.
- Run the listing sketch from `DATA_MODEL.md` (default sort) and show the top 10 rows; show one product page sketch result; show that out-of-stock products and a "New seller" exist.
- Open 3 cover URLs (HTTP 200).
- Secret scan: no token/secret/host in the diff, snapshot or logs.

## 7. Docs
- `CLAUDE.md`: seed rules (snapshot is generated only locally by the owner; seed is deterministic; production seeding only via the workflow; IGDB credentials never leave `.env`).
- `.env.example`: add `IGDB_CLIENT_ID=` / `IGDB_CLIENT_SECRET=` with a comment "local only, for cmd/igdb-snapshot".
- `README.md`: short "Seed data" section.
- `docs/PAAISKINIMAI_LT.md`: why a committed snapshot instead of calling IGDB at runtime; OAuth client credentials; deterministic seed (why fixed RNG seed); `CopyFrom`; why seed refuses without `--reset`; why codes start with `DEMO-`; noindex/robots and the phishing-risk reasoning.

## Owner manual steps (list exactly in the report)
After merge: *Actions → Seed production → Run workflow* (`confirm` = `seed-production`), then check the production `/api/health` still works.

## Report
As defined in `CLAUDE.md`. Export the session log at the end and commit it on this branch.

---

## Addendum (given by the owner together with the task, verbatim)

Addendum to Task 08 – add to CLAUDE.md (Workflow rules):
- The PR is always created by you with the template already filled in: Summary (3–5 lines), Task file link, Report link, CI status, Manual test checklist. Use `gh pr create --title "Task NN: …" --body-file <generated file>`.
- If gh is not logged in: generate a pre-filled GitHub link instead, so the owner opens the PR with one click:
  https://github.com/dovydas472/ENEBA-homework/compare/main...<branch>?expand=1&title=<url-encoded title>&body=<url-encoded body>
  Print that link as the last line of your chat summary.
Apply this rule to this task's PR already.
