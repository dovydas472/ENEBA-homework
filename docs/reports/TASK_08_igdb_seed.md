# Report – Task 08: IGDB snapshot + deterministic seed data (+ demo safety basics)

Task file: [`../tasks/TASK_08_igdb_seed.md`](../tasks/TASK_08_igdb_seed.md) (with the owner's addendum about PR creation at the end)
Branch: `task/08-igdb-seed` (from `main` at `af8138a`, after the merge of PR #4 / Task 06)

## 1. Files changed
**New**
- `cmd/igdb-snapshot/main.go`: local-only tool. It gets a Twitch OAuth token (client credentials), sends one IGDB `POST /v4/games` query, filters the result and writes the snapshot.
- `pkg/igdb/`:
  - `snapshot.go`: snapshot format, IGDB platform/theme ids, `ParseSnapshot`, `CoverURL`.
  - `client.go`: Twitch + IGDB client. Secrets go only in the body and headers, errors show only the HTTP status, and there is at least 300 ms between requests.
  - `select.go`: the Apicalypse query, the same filters repeated in Go (`Select`), and `TrimSummary`.
  - `select_test.go`: unit tests.
- `seed/igdb_snapshot.json`: 50 games, fetched 2026-11-20T22:35:40Z, pretty-printed. The header has the source, attribution, fetch time, endpoint, the exact query and the Go filters.
- `seed/embed.go`: package `seed`, which embeds the snapshot with `go:embed`.
- `pkg/seedgen/`:
  - `catalog.go`: row types, plus the fixed platforms, regions and 8 fictional sellers.
  - `rules.go`: small pure rule functions.
  - `generate.go`: `Generate` (fixed RNG seed) and `Validate`.
  - `db.go`: `Lock`, `Counts`, `Reset`, `Insert` (`CopyFrom`) and `Checksum`.
  - Tests: `rules_test.go`, `generate_test.go` and `snapshot_test.go`. The last one checks the real snapshot and a golden hash.
- `cmd/seed/main.go`: the seed CLI (`--reset`). It runs in one transaction, prints counts and a checksum, and never prints connection details.
- `pkg/dbsafe/dbsafe.go` + `dbsafe_test.go`: `CheckDirectURL` (the `-pooler` guard) and `SafeMessage` (redaction). They were moved out of `cmd/migrate` so `cmd/seed` can reuse them, and their tests moved with them.
- `.github/workflows/seed-production.yml`: manual "Seed production" workflow.
- `public/robots.txt` (`User-agent: *` / `Disallow: /`).
- `docs/tasks/TASK_08_igdb_seed.md` (verbatim) and this report.
- `ai-logs/2026-11-20_04_design-tokens.md` (Task 06 session, full version) and `ai-logs/2026-11-20_05_igdb-seed.md` (this session). Both were converted from the transcript and redacted.

**Changed**
- `cmd/migrate/main.go`, `helpers.go`, `main_test.go`: now use `pkg/dbsafe`. Behaviour is the same; only one message wording changed ("this tool needs the DIRECT connection").
- `index.html`: `<meta name="robots" content="noindex, nofollow">`, title `EneHomeworkBa – internship demo`.
- `README.md`:
  - The verbatim disclaimer at the very top.
  - Title `EneHomeworkBa (ENEBA homework)`.
  - New "Seed data" section, IGDB env vars, and layout lines.
- `CLAUDE.md`:
  - New "Seed data rules" section.
  - `godotenv` tool list now includes `cmd/seed` and `cmd/igdb-snapshot`.
  - The addendum's PR rule replaces the old "gh missing" line.
- `.github/pull_request_template.md`: new "CI status" section (the addendum lists it), summary is now 3–5 lines.
- `.env.example`: `IGDB_CLIENT_ID=` / `IGDB_CLIENT_SECRET=` with a "local only" comment. The comment on `DATABASE_URL_DIRECT` now also mentions `cmd/seed`.
- `docs/DATA_MODEL.md`: doc-only, **no schema change**. The `cover_url`, `popularity` and `sellers` descriptions now say where the data comes from.
- `docs/PAAISKINIMAI_LT.md`:
  - 7 new sections: committed snapshot vs runtime IGDB (with `go:embed`), OAuth client credentials, deterministic seed, `CopyFrom`, refusing without `--reset`, `DEMO-` codes, noindex/robots and phishing.
  - References to `checkDirectURL` / `safeMessage` now point to `pkg/dbsafe`.
- `ai-logs/2026-11-20_03_data-model.md`: a regenerated Task 05 log that was left uncommitted.

`go.mod` / `go.sum` are unchanged (still `go 1.25.0`); there are no new dependencies (`pgx`, `godotenv` and the standard library only).

## 2. Verification results
Everything ran against the Neon **`dev`** branch only. Nothing touched `production`.

| Check | Result |
|---|---|
| `go build ./...`, `go vet ./...` | pass |
| `go test ./...` | pass (`cmd/migrate`, `pkg/dbsafe`, `pkg/igdb`, `pkg/seedgen`, `pkg/server`) |
| `GOTOOLCHAIN=go1.25.0 go test ./pkg/seedgen ./pkg/igdb ./pkg/dbsafe` | pass: **same golden hash** with Go 1.25.0 (the CI version) and Go 1.27.4 (local) |
| `npm run build` | pass; `dist/` contains `robots.txt`; `dist/index.html` has the robots meta and the new title |
| gofmt (committed Go files) | clean (the working copy shows CRLF only because of `core.autocrlf`) |
| workflow YAML parse | both workflows parse; seed inputs are `reset`, `confirm`; concurrency group is `migrate-production` |
| `go.mod` `go` directive | still `go 1.25.0` |

**IGDB reference ids, checked against IGDB itself** (`platforms`, `game_types`, `themes` endpoints):
- Platforms: 6 = PC (Windows), 48 = PS4, 167 = PS5, 49 = Xbox One, 169 = Xbox Series X|S, 130 = Switch, 508 = Switch 2.
- Game types: 0 = Main Game, 8 = Remake (excluded: 1 DLC, 2 Expansion, 3 Bundle, 9 Remaster, 10 Expanded Game, 11 Port, 13 Pack …).
- Theme 42 = Erotic.

**Snapshot** (`go run ./cmd/igdb-snapshot`): IGDB returned 60 candidates, and the best **50** were kept.
- Every game has a cover `image_id` and a summary. The longest trimmed summary is 298 characters.
- Erotic theme: I sent a separate IGDB query for the themes of exactly these 50 ids, and **0 of 50** have theme 42. The same top-60 query *without* the theme filter also contains 0 erotic-themed games, so the filter is a safety net that removed nothing here.

```
 1. Grand Theft Auto V              popularity 6075
 2. The Witcher 3: Wild Hunt        popularity 5570
 3. Portal 2                        popularity 4553
 4. The Elder Scrolls V: Skyrim     popularity 4388
 5. Grand Theft Auto: San Andreas   popularity 4139
 6. Portal                          popularity 4078
 7. Red Dead Redemption 2           popularity 3960
 8. God of War                      popularity 3666
 9. Half-Life 2                     popularity 3506
10. Assassin's Creed II             popularity 3257
```

**Seed on `dev`.** The `dev` catalog was empty, so the first plain run seeded it. A second plain run then refused:
```
$ go run ./cmd/seed            # catalog already seeded
error: the catalog already contains data (keys=1573, offers=395, products=108, sellers=8, games=50, regions=4, platforms=9). Nothing was changed. Run with --reset to delete it and seed again
exit status 1

$ go run ./cmd/seed --reset
snapshot: 50 games (IGDB, fetched 2026-11-20T22:35:40Z)
--reset: deleting existing catalog (keys=1378, offers=348, products=97, sellers=8, games=50, regions=4, platforms=9)
seeded (committed):
  platforms       9
  regions         4
  games          50
  sellers         8
  products      108
  offers        395
  keys         1573
  out-of-stock products: 11, offers without keys: 40, inactive offers: 27
  keys: 1275 available, 7 reserved (expired), 291 sold; new sellers: 1
catalog checksum: aca2b5f17436a6f93970ac97f7081279
```
(The refusal block above is from the final data. I ran it once on the first version and once more after the rule changes.)

**Determinism:** `--reset` twice in a row printed `catalog checksum: aca2b5f17436a6f93970ac97f7081279` both times, **identical**.
- Earlier, with the first rule set, a plain seed and two `--reset` runs all printed `08efa49a0aae6dc853891297b4b6e7fe`.
- The checksum is an MD5 of every catalog row in table/id order. It includes the ids, and key timestamps as Unix seconds. It excludes only the `created_at`/`updated_at` columns that `now()` fills.
- **Production must print the same checksum.**

**Listing sketch** (`DATA_MODEL.md` §1, default sort = popularity, no filters, `LIMIT 10`):
```
slug                                                          platform        region         price   msrp  disc% offers in_stock  pop
grand-theft-auto-v-steam-global                               Steam           GLOBAL         11.99  29.99  -60%      1  true  6075
grand-theft-auto-v-psn-global                                 PSN             GLOBAL         20.49  29.99  -31%      2  true  6075
grand-theft-auto-v-game-of-the-year-edition-steam-global      Steam           GLOBAL         15.49  49.99  -69%      4  true  6075
the-witcher-3-wild-hunt-steam-global                          Steam           GLOBAL         10.99  39.99  -72%      4  true  5570
the-witcher-3-wild-hunt-game-of-the-year-edition-steam-global Steam           GLOBAL         29.99  59.99  -50%      4  true  5570
portal-2-steam-global                                         Steam           GLOBAL          8.49  29.99  -71%      3  true  4553
portal-2-epic-games-europe                                    Epic Games      EUROPE         10.49  29.99  -65%      4  true  4553
portal-2-nintendo-eshop-united-states                         Nintendo eShop  UNITED STATES  12.99  29.99  -56%      4  true  4553
portal-2-game-of-the-year-edition-steam-global                Steam           GLOBAL         22.99  49.99  -54%      2  true  4553
the-elder-scrolls-v-skyrim-steam-global                       Steam           GLOBAL         12.99  29.99  -56%      2  true  4388
total_count: 108
```

**Product page sketch** (§2) for `the-witcher-3-wild-hunt-steam-global`. Only buyable offers appear, cheapest first, and it includes the "New seller":
```
offer 15  10.99  Retro Ridge       rating 7.38               reviews   212  stock 6
offer 11  12.99  Quest Depot       rating 8.46               reviews   860  stock 4
offer 13  18.99  Fresh Start Keys  rating NULL (New seller)  reviews     0  stock 6
offer 14  25.99  Keystone Kiosk    rating 9.63               reviews  9875  stock 2
```

**Out-of-stock products.** The listing sketch returns 11 rows with `in_stock = false`:
`grand-theft-auto-san-andreas-steam-global`, `portal-game-of-the-year-edition-steam-global`, `half-life-steam-europe`, `batman-arkham-asylum-steam-global`, `dark-souls-iii-psn-latam`, `bloodborne-psn-global`, `bloodborne-psn-europe`, `assassins-creed-iv-black-flag-xbox-live-europe`, `hades-psn-global`, `hades-xbox-live-united-states`, `fallout-4-steam-global`.

**Sellers** (one row per tier, plus the New seller):

| Seller | Rating | Tier | Reviews |
|---|---|---|---|
| Pixel Harbor | 9.91 | Superb | 48 210 |
| Arcade Owl | 9.78 | Superb | 15 320 |
| Keystone Kiosk | 9.63 | Excellent | 9 875 |
| Byte Bazaar | 9.52 | Excellent | 4 310 |
| Lunar Loot | 9.27 | Very good | 2 140 |
| Quest Depot | 8.46 | Good | 860 |
| Retro Ridge | 7.38 | no label | 212 |
| Fresh Start Keys | **NULL** | New seller | 0 |

**Other data checks (SQL on `dev`):**
- Keys: available 1275, reserved 7, sold 291. Every reserved key has `reserved_until < now()`, and every sold key has `sold_at`.
- Offers per product: 2–5. Keys per offer: 0–8. 40 offers have no keys; 27 offers are inactive.
- Prices are 25–89 % of MSRP, and **0** prices end in anything other than .49 or .99.
- **0** codes fail the format `^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`. Sample code: `DEMO-OTMB-L4WU-WZDH`.
- Editions: Standard, Game of the Year Edition, Deluxe Edition.
- Products per platform: Steam 54, PSN 17, EA App 10, Xbox Live 7, Nintendo eShop 7, Ubisoft Connect 7, GOG.com 4, Epic Games 2, Battle.net 0 (see open questions).
- Products per region: GLOBAL 70, EUROPE 22, LATAM 11, UNITED STATES 5.
- Ids start at 1 (games 1–50, keys 1–1573).
- Sample game row: `grand-theft-auto-v | Grand Theft Auto V | 2013-09-17 | Rockstar North | Take-Two Interactive | popularity 6075 | igdb 1020 | Shooter/Racing/Adventure`.

**Covers** (3 URLs from the snapshot):
```
200 image/jpeg 29166B  https://images.igdb.com/igdb/image/upload/t_cover_big/co2lbd.jpg
200 image/jpeg 16188B  https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg
200 image/jpeg 19668B  https://images.igdb.com/igdb/image/upload/t_cover_big/co2mvs.jpg
```

**Safety checks:**
- The `-pooler` guard works. `DATABASE_URL_DIRECT='postgres://u:secretpw@ep-fake-123-pooler.example.com/db' go run ./cmd/seed` prints `error: DATABASE_URL_DIRECT points to the POOLED connection ...` and exits 1, without echoing the URL.
- Secret scan: the actual `.env` values (both connection strings and their host, user and password, plus the IGDB client id and secret) were compared against the branch diff, every branch commit (`git log -p`) and the snapshot: **none found**.
- Pattern scan (`npg_`, Bearer tokens, `access_token`, gmail): 0 matches. The only `postgres://` / `neon.tech` hits are the fake URLs in the moved unit tests and grep patterns quoted in an older session log.
- The token and secret were never printed. The tool prints `token received (not shown)`.

## 3. What the owner must do manually
1. **Open the PR.** `gh` is not logged in, so use the pre-filled link printed at the end of the chat summary. Optionally run `gh auth login` once, so future PRs can be created directly.
2. Review and merge the PR.
3. **After the merge, "Migrate production" runs automatically**, because `cmd/migrate/**` changed (the shared guard moved to `pkg/dbsafe`). It should apply nothing ("nothing to apply"). Wait until it is green; the seed workflow shares its concurrency group, so it would wait anyway.
4. Run the seed: *Actions → Seed production → Run workflow*.
   - Set `confirm` = `seed-production`.
   - Leave `reset` **unticked** for the first run; production's catalog should be empty.
   - The log must show the counts above and **`catalog checksum: aca2b5f17436a6f93970ac97f7081279`** (the same as `dev`).
   - If it refuses because data exists, run it again with `reset` ticked.
5. Check that production `/api/health` still returns `{"status":"ok","db":"ok",...}`.
6. IGDB: the client secret in `.env` was invalid at the start of the session (Twitch: "invalid client secret"), and you generated a new one. Keep it only in the local `.env`.

## 4. Plain-language explanation
- **Why a snapshot.** The catalog needs real game data, but the app must not depend on IGDB or hold its password. So the owner downloads 50 well-known games **once**, on their own PC, into a JSON file that is committed. The seed and the app only read that file, and covers load straight from IGDB's image CDN.
- **How the snapshot is made.** The tool logs in to Twitch with OAuth *client credentials* (a program proving its identity, with no user involved). It asks IGDB for the 60 most-rated main games that have a cover and summary, excluding DLC, editions and the Erotic theme. It checks the same rules again in Go, keeps the best 50, shortens each description to two sentences, and writes the file.
- **How the seed works.** `cmd/seed` turns the snapshot into a whole shop:
  - 9 activation services and 4 regions.
  - 8 invented sellers covering every rating tier.
  - 1–3 products per game, plus special editions for the 8 most popular games.
  - 2–5 offers per product, at shop-like prices of 25–90 % of the list price.
  - 0–8 fake `DEMO-` keys per offer, including deliberate edge cases (sold-out products, offers without keys, expired reservations, sold keys).
- **Why it's deterministic.** A fixed random seed means the "random" choices are the same every run, so `dev` and `production` get **identical** data, including the ids. The printed checksum proves it, and a golden test catches any accidental change.
- **Why it's safe to run.** Everything happens in one transaction: either the whole new catalog appears or nothing changes. The tool refuses to overwrite existing data unless `--reset` is given. It uses only the direct connection (same guard as migrations) and never prints connection details. Production is seeded only by a manual GitHub Actions workflow that requires typing `seed-production`.
- **Bulk insert.** The big tables are written with Postgres `COPY` (`pgx.CopyFrom`): all rows in one stream instead of ~2 000 separate INSERT round trips to Frankfurt.
- **Demo safety.** `noindex` and `robots.txt` keep search engines away, and the tab title and README say "demo" and "not affiliated". The site looks like a real shop with real game names, so people should not find it through Google and mistake it for one, and it should not be easy to reuse for phishing.

## 5. Deviations from the task and why
1. **Game types `(0, 8)` = Main Game + Remake.** The task says "main games, not DLC/bundles/editions". A remake is a full, separately sold game, so I counted it as one. Remasters (9) and "Expanded Game" (10, e.g. GOTY re-releases) are excluded as editions. No remake made the top 50 anyway.
2. **Only consoles that still sell keys are mapped:**
   - PS4 and PS5 → PSN.
   - Xbox One and Xbox Series → Xbox Live.
   - Switch and Switch 2 → Nintendo eShop.

   PS3, Xbox 360 and similar are ignored, and the snapshot keeps only games with at least one supported platform, so every game can be sold. The snapshot stores only the supported platform ids.
3. **Two extra mapping and slug rules, found on the real data:**
   - **Valve games always use Steam:** IGDB lists EA as a co-publisher of Portal and Portal 2 (EA published the retail boxes), so the EA → EA App rule would have been wrong there.
   - **CD Projekt games always get GOG.com.**
   - **IGDB's `--N` slug suffix is dropped:** `god-of-war--1` → `god-of-war`, `hades--1` → `hades`. If two slugs ever collide, the seed appends `-2`.
4. **Generation details that the task leaves open:**
   - **Editions:** games released up to 2017 get "Game of the Year Edition", newer ones "Deluxe Edition". Edition MSRP is +20.00.
   - **Edition product:** it is added on the game's main platform + GLOBAL, for the 8 most popular games.
   - **First product:** always the main platform + GLOBAL.
   - **Extra products:** they prefer a platform the game does not have yet; otherwise most extras would be one more Steam product, and Xbox Live had only 2 products.
   - **Price clamp:** after rounding to .49/.99, a price is moved by one 0.50 step if rounding pushed it outside 25–90 %.
5. **Key timestamps come from the snapshot date, not `now()`:**
   - `created_at` is set explicitly to 30–89 days before the fetch date.
   - `sold_at` falls between `created_at` and the fetch date.
   - `reserved_until` is 1–72 h before the fetch date.

   This keeps the data deterministic and inside the checksum, and keeps `sold_at` after `created_at`. Other tables keep `created_at default now()`. There are **only expired reservations**: an active one would have to be relative to `now()`, which is not deterministic, and it would expire after 15 minutes anyway.
6. **Reset uses `DELETE` in dependency order + `ALTER TABLE … ALTER COLUMN id RESTART WITH 1`**, not `TRUNCATE` or `setval`. Both statements are transactional, so a failed seed rolls back the ids too, which would not happen with `setval`. Unlike `TRUNCATE … CASCADE`, they can never silently delete future order data.
   - The identity restart also runs on an **empty** catalog without `--reset`, so the ids are identical even if someone emptied the tables by hand.
7. **Extras in `cmd/seed`:**
   - `LOCK TABLE … SHARE ROW EXCLUSIVE`, so two parallel runs cannot both see "empty".
   - `Validate`, which checks the DB rules and the promised edge cases before connecting.
   - The printed `catalog checksum`, so `dev` and `production` can be compared.
8. **The workflow uses the concurrency group `migrate-production`** (the same as the migration workflow), so seeding and migrating production can never run at the same time.
9. **Shared code moved to `pkg/dbsafe`.** This touches `cmd/migrate`, so "Migrate production" will run once after the merge; it is harmless.
10. **Snapshot format:**
    - The header has extra fields: `attribution`, `endpoint`, `filters`.
    - `first_release_date` is stored as `release_date` (`YYYY-MM-DD`, UTC).
    - `involved_companies` are split into `developers` / `publishers` name lists. The seed uses the first one of each.
11. **The addendum's PR rule is applied.** I also added a "CI status" section to the PR template, because the rule lists it and the template did not have it.
12. **README title** is now `EneHomeworkBa (ENEBA homework)`, under the verbatim disclaimer.
13. **DATA_MODEL.md** got doc-only clarifications (cover source, popularity source, sellers come from the seed). This is not a schema change.

## 6. Open questions
1. **Battle.net has 0 products and Epic Games only 2.** No Blizzard game is among the 50 most-rated games, and Epic is added to only ~15 % of Steam games. Should I add a Blizzard game on purpose (it would need a second, explicit IGDB query) or raise the Epic share? Otherwise the Battle.net filter shows an empty list.
2. **README / LT text vs CLAUDE.md:** the README env table and `PAAISKINIMAI_LT.md` say Vercel Production uses the Neon **`main`** branch, while CLAUDE.md says **`production`**. This was already there before this task, so I did not change it. Which one is right?
3. `index.html` has `lang="lt"`, but the UI text will be English. Switch to `lang="en"` in a UI task?
4. `ai-logs/` has two logs for the Task 06 session: `2026-11-20_02_design-tokens.md` (on `main`) and `2026-11-20_04_design-tokens.md` (a later, fuller regeneration, committed here because it was uncommitted). Should the older `02_…` be deleted?
5. Once the checkout task adds `orders`/`order_items`, `--reset` will fail with a RESTRICT error if any order references an offer or key. I think that is the right behaviour, since sold keys must not disappear. Is that what you want, or should reset be blocked earlier with a clearer message?
