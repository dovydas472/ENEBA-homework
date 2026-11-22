# Task 14 – Authentication: register, sign in, sign out, demo user, protected routes: report

Task file: [`docs/tasks/TASK_14_auth.md`](../tasks/TASK_14_auth.md) · Branch: `task/14-auth` · **This PR has a migration (`00004_auth.sql`): production is migrated from this branch BEFORE the merge (§3).**

## 1. Files changed

**Database**
- `migrations/00004_auth.sql`: `users` (`email citext UNIQUE`, `password_hash` NULL only for demo – CHECK, `is_demo`), `sessions` (`token_hash bytea` PK = SHA-256 of the token, `user_id` → `users` ON DELETE CASCADE, indexes on `user_id` and `expires_at`), `login_failures` (rate limit: `email citext` PK, `attempt_count`, `window_start` + index). Only new tables → backward compatible.

**Go – `pkg/auth` (new, no HTTP)**
- `password.go`: argon2id hash/verify (OWASP m=19 MiB, t=2, p=1, 16-byte salt, PHC string, constant-time compare, bounds on parameters read from a stored hash), `dummyHash` + `BurnPasswordCheck` for the timing rule.
- `token.go`: 32-byte session token from `crypto/rand`, base64url in the cookie, SHA-256 for the DB; `SessionTTL` = 7 days.
- `validate.go`: email (trim, `net/mail`, ≤ 254, a dot in the domain, `@demo.invalid` reserved on sign-up), password 8–128 characters (runes).
- `store.go`: `CreateUser` (UNIQUE → `ErrEmailTaken`), `CreateDemoUser`, `UserByEmail`, `CreateSession` (+ deletes expired sessions), `UserBySession` (expired → deleted, `ErrNoSession`), `DeleteSession`, `CountLoginAttempt` (atomic, before the password check), `ClearLoginFailures`.
- Tests: `password_test.go`, `token_test.go`, `validate_test.go` (unit), `store_integration_test.go` (CI DB).

**Go – `pkg/server`**
- `auth_handlers.go`: `POST /api/auth/register|login|logout|demo`; three small interfaces (`AccountStore`, `SessionStore`, `LoginLimiter`) = `AuthStore`; `noStore`; 503/500 rules.
- `session.go`: cookie attributes, `currentUser`, `requireUser` (used by `GET /api/auth/me`, ready for checkout/orders), `SessionReader`.
- `origin.go`: `requireSameOrigin` – the CSRF `Origin` check for every POST/PUT/PATCH/DELETE (forwarded host aware), wrapped around the whole router.
- `router.go`: auth routes + 405s, `Deps.Auth`, the Origin wrapper. `catalog_handlers.go`: log prefix `api:` (the helpers are shared now).
- Tests: `origin_test.go`, `session_test.go`, `auth_handlers_test.go` (fake store), `auth_integration_test.go` (real store, CI DB); two existing 405 tests now send a same-origin `Origin`.
- `api/index.go`, `cmd/local/main.go`: pass `auth.NewStore(lazyDB)`.
- `pkg/testdb/testdb.go`: `Migrated(t)` (schema only, no catalog reset) and a goose Postgres session lock so parallel test packages cannot migrate at the same time.
- `go.mod` / `go.sum`: `golang.org/x/crypto v0.55.0` (the newest that still declares `go 1.25.0`; `@latest` would have raised the `go` directive to 1.26 – reverted). It requires `golang.org/x/sys v0.47.0` (was v0.41.0 indirectly; `go mod graph` confirms the requirement).

**CI** – `.github/workflows/ci.yml`: the "tests ran, not skipped" step now covers `pkg/catalog`, `pkg/auth`, `pkg/server` and names two auth integration tests.

**Frontend**
- `src/api/auth.ts` (+ test): `getCurrentUser` (401 → `null`), `login`, `register`, `signInAsDemo`, `logout`, `authErrorMessage`, `displayName`. `src/api/client.ts` (+ test): `204` → `undefined`. `src/api/queries.ts`: `queryKeys.currentUser`, `currentUserQuery`.
- `src/features/auth/`: `useCurrentUser.ts` (query + mutations writing the cache), `useSignOut.ts`, `AuthPage.tsx`/`.module.css` (one component for `/login` and `/register`), `PasswordField.tsx`, `RequireAuth.tsx`, `validation.ts`, `fakeAuthServer.ts` (test helper); tests `AuthPage.test.tsx`, `RequireAuth.test.tsx`, `validation.test.ts`.
- `src/components/TextField.tsx`/`.module.css`: labelled input with hint, error and a trailing slot.
- `src/lib/safeNext.ts` (+ test): the `next` sanitizer and `authPageLink`.
- `src/app/AccountMenu.tsx`/`.module.css`/`.test.tsx`; `Header.tsx` (menu when signed in, "Sign in" keeps `next`); `MenuDrawer.tsx`/`.module.css` (account part, its links keep `next` too); `routes.ts` (`RequireAuth` layout route around `/orders`); `src/pages/LoginPage.tsx`, `RegisterPage.tsx`, `OrdersPage.tsx` ("Signed in as …").
- `src/app/routes.test.tsx`, `src/pages/ProductPage.test.tsx`: adapted to the header's `/api/auth/me` request.
- `src/styles/tokens.css`: `--auth-panel-width`, `--account-menu-width`, `--account-name-max-width`.
- `vite.config.ts`: the `/api` proxy keeps the `Host` header and sends `X-Forwarded-Host` (see §5).

**Docs** – `docs/DATA_MODEL.md` (auth tables created + `login_failures`), `docs/DESIGN.md` (2.4 tokens, 3.1 account menu, 3.6 sign-in measured + as built, 4.2 `TextField`, 5.1 contrast rows, 6 research note), `README.md` (auth section + shortcuts), `docs/PAAISKINIMAI_LT.md` (Task 14 block), `docs/reports/assets/task14_*.png` (our screenshots).

## 2. Verification results

| Check | Result |
|---|---|
| `gofmt -l .` | prints nothing |
| `go build ./...`, `go vet ./...`, `go test ./...` | pass. `go.mod` still `go 1.25.0` |
| Go integration tests (`pkg/auth`, `pkg/server`) | **skipped locally** (no Postgres on this machine, `TEST_DATABASE_URL` empty). **CI (PR #16, job `migrations`, Postgres 18): all passed** – the "tests ran" step reports `catalog + auth tests: 98 passed, 0 skipped`, incl. `TestAuthFlow_registerMeLogoutMe`, `…duplicateEmailIs409CaseInsensitive`, `…wrongPasswordIsGeneric401`, `…eleventhFailureIs429`, `…successClearsTheCounter`, `…twoDemoClicksAreTwoUsers`, `…expiredSessionIs401`, `TestStore_deletingAUserDeletesItsSessions`, `TestStore_loginAttemptCounter`, `TestStore_parallelAttemptsAreAllCounted`. Jobs `go`, `frontend` and the Vercel Preview also green |
| `npm run lint` | 0 problems |
| `npm test` (PowerShell) | **37 files, 460 tests passed**. New: `auth.test.ts`, `AuthPage.test.tsx` (18), `AccountMenu.test.tsx` (10), `RequireAuth.test.tsx` (4), `safeNext.test.ts`, `validation.test.ts`; `client.test.ts` +1, `routes.test.tsx` +3 |
| `npm run build` | pass |
| Migration on Neon **dev** | `go run ./cmd/migrate up` → `down` → `up`: all fine (re-run after the column rename in §5) |
| API against **dev** (`cmd/local` on 127.0.0.1:8094, curl) | register `201` + `Set-Cookie: session=…; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`, `Cache-Control: no-store`; me `200`; duplicate email in upper case `409`; **foreign Origin `403`**, **no Origin `403`**; logout `204` + `Max-Age=0`; me after logout `401`; wrong password and unknown email both `401 {"error":"Invalid email or password"}`; two demo calls → two users `demo-<hex>@demo.invalid`; catalog with a cookie still `public, s-maxage=60…`, no `Set-Cookie` |
| Rate limit on dev | 10 × wrong password → `401`; 11th with the **right** password → `429`, `Retry-After: 899`. **Parallel burst** of 30 attempts for one email → exactly **10 × 401 and 20 × 429** |
| Timing on dev | 5 sign-ins each: known email + wrong password avg 0.133 s, unknown email avg 0.116 s. Same order of magnitude: the dummy hash runs on both paths, the rest is network noise to Neon |
| **Real browser** (headless Edge, `vite preview` of the production build → API → Neon dev) | **28/28 checks**: `/orders` signed out → `/login?next=%2Forders`; empty submit shows inline errors; wrong password → generic message; "Create an account" keeps `next`; register → back to `/orders` with "Signed in as …"; **the cookie as the browser stored it: httpOnly=true, secure=true, sameSite=Lax, path=/, expires in 604799 s**; `document.cookie` empty (HttpOnly); account menu opens, Esc closes it and focuses the button, Enter + Tab → Orders → Sign out; sign out → `/` with "Sign in", cookie gone; sign in with the email in UPPER CASE → `/orders`; demo user → `/orders` as "Demo user"; signed-in visit to `/login?next=//evil.example` stays on our origin at `/`; phone menu shows the account part |
| **axe-core** (WCAG 2 A/AA, 2.1 AA, best practice) | **0 violations** on: `/login` desktop, `/login` with inline errors, `/register` desktop, account menu open (desktop), `/login` phone, `/register` phone, phone menu open (signed in), account menu open (phone) |
| Horizontal overflow | none (both auth pages and the open account menu at 390 px) |
| Loopback | `cmd/local` on 127.0.0.1:8094 and `vite preview` on 127.0.0.1:4194 (config in the scratchpad); nothing on 0.0.0.0. Scripts, the preview config and Eneba's reference screenshots stayed in the session scratchpad |

**Screenshots (ours):** `docs/reports/assets/task14_login-desktop.png`, `task14_login-errors-desktop.png`, `task14_login-server-error-desktop.png`, `task14_register-desktop.png`, `task14_account-menu-desktop.png`, `task14_orders-demo-desktop.png`, `task14_login-mobile.png`, `task14_register-mobile.png`, `task14_phone-menu-signed-out-mobile.png`, `task14_phone-menu-signed-in-mobile.png`, `task14_account-menu-mobile.png`.

### Comparison with eneba.com (1440 / 390): difference → changed → still different, why

Reference: headless Edge, one plain load per width of `my.eneba.com/login` (no challenge this time) and of `www.eneba.com` (header). Reference screenshots stay outside the repo. Measurements: DESIGN.md 3.6.

| Eneba (measured) | Ours | Still different (why) |
|---|---|---|
| Sign-in is a separate site: no shop header, dark page `#1f0a4e`, big "Hi! It's nice to see you!" on the left | Inside our layout (banner, header, footer stay) on `--color-bg` | The pages are part of the shop flow (`next` returns to the page); the greeting is Eneba's copy, not copied |
| Panel 380px, 40px padding (300px column), `#4618ac` | **Changed:** 380px (`--auth-panel-width`), 40px padding; `--color-bg-deep` | Deep, not Eneba's page purple: error text must pass 4.5:1 (6.82 on deep, 4.17 on surface), and the panel must stand out from our purple page |
| "Log in" + "New user? **Create account**" right under it | **Changed:** "Sign in" + "New here? **Create an account**" under the title | Wording follows our "Sign in" (Task 11b header) |
| Google / Facebook / Apple buttons + Steam / Discord / Twitch / X icons | none | No social sign-in (owner decision A1: email + password); it would be dead UI |
| "Get magic link" (yellow) + "Log in with password" (outlined) | Email + password form with a yellow "Sign in"; the **demo button** (outlined) first | No magic links (we send no email); the demo button is an owner requirement and uses our outlined secondary button |
| Email field 300×56, `#3d1596`, the placeholder is the only label, 14px | 40px field (`--control-height`), visible label above, inset background | A placeholder is not a label (it disappears while typing); kept the DESIGN 4.2 input |
| Buttons 300×36, 15px extra-bold | **Changed:** full width, standard `--button-height` (35px; 40px on phones), 15px bold | 1px from the shared button token |
| Phone: no panel, the form fills the page on `#4618ac` | Full-width panel with 20px padding under our phone header | Same reason as row 1 |
| Header 1440: "Log in \| Register" 15px extra-bold; signed in: an avatar menu | "Sign in" (14px medium, Task 11b) → account menu with the email or "Demo user", a chevron, and a popup "Signed in as / Orders / Sign out" | No avatars or profile pages; one link instead of two (Task 11b decision) |
| Header 390: account icon | Account icon; signed in, it opens the same popup; the ☰ menu has the account part too | – |

### Intentionally not copied
Eneba's logo and illustration, the "Hi! It's nice to see you!" greeting, the social sign-in buttons and their icons, magic links, the language switcher and the auth site's own footer.

## 3. What the owner must do manually
1. **Before merging, migrate production from this branch:** *Actions → Migrate production → Run workflow*, "Use workflow from" = **`task/14-auth`**. Check that the log shows `00004_auth.sql` applied, and only then merge. (The automatic run after the merge then finds nothing to apply. `00004` must not change after this run.)
2. On the PR Preview: open `/orders` → you land on sign-in. Try "Sign in as demo user" (back on `/orders` as "Demo user"), sign out from the header menu, register with any email, sign out, sign in again, try a wrong password a few times. On a phone, open ☰ and check the account part.
3. DevTools → Application → Cookies on the Preview: `session` is HttpOnly, Secure, SameSite=Lax.
4. ~~Decide the open question in §6.1~~ – answered: keep (a), see §6.
5. `/export` this session into `ai-logs/` (`YYYY-MM-DD_NN_auth.md`). If you leave it uncommitted, I commit it on this branch.
6. Your older local servers (`cmd/local` on :8080, Vite on :5173/:4173) still run old code. Restart them from `main` after the merge: local sign-in needs this PR's Vite proxy change.

## 4. Plain-language explanation
- **Accounts.** A visitor can create an account with an email and a password (8–128 characters), sign in and sign out. There is no email confirmation and no "forgot password"; both are listed as shortcuts in the README.
- **Demo user.** "Sign in as demo user" makes a brand-new throw-away account on every click, so every reviewer will see only their own orders. It has no password, so nobody else can get into it.
- **Passwords are never stored.** Only an argon2id "fingerprint" is stored. It is deliberately slow and memory-hungry, so a leaked database cannot be cracked quickly.
- **Staying signed in.** The browser keeps a random 32-byte key in a cookie for 7 days. The database stores only a fingerprint (SHA-256) of that key, so even a leaked database gives nobody a usable cookie. JavaScript cannot read the cookie, and the browser does not send it with requests that other websites make.
- **Protection against other websites (CSRF).** Every request that changes something must come from our own pages. The server compares the `Origin` header with its own host and answers 403 otherwise.
- **Guessing passwords.** After 10 wrong passwords for an email within 15 minutes, sign-in for that email pauses until the window ends. The counter lives in the database, so it works across many serverless instances. Attempts are counted before the password is checked, so sending many at once does not help.
- **Not revealing who has an account.** Every failed sign-in gets the same message and takes about the same time.
- **Protected pages.** `/orders` (and later checkout) sends a signed-out visitor to sign-in and brings them back afterwards. Only paths on our own site are accepted as the "back to" target.

## 5. Deviations from the task and why
- **The rate limit counts attempts first (column `attempt_count`, not a "failed count").** The automated security review found that "check → verify → record the failure" lets parallel requests slip past the limit. Now every attempt is counted atomically before the password check and a success clears the row, so what stays stored are the failures. The behaviour A6 asks for is unchanged (verified: the 11th attempt → 429; a burst → exactly 10 checks). `00004` was edited for this **before** being merged or applied to production (only on `dev`, re-run down/up).
- **The Vite proxy changed (`vite.config.ts`).** The string shorthand rewrote the `Host` header, so the Origin check rejected every local POST. The object form with `xfwd: true` keeps `Host` and adds `X-Forwarded-Host`, like Vercel does.
- **Sign-out goes home first** (`navigate("/", { flushSync: true })`, then the request). Otherwise signing out on `/orders` bounced to `/login?next=/orders` (a React transition race; a test reproduces it and fails without `flushSync`).
- **`apiFetch` accepts `204`** (resolves `undefined`), needed for logout.
- **The body of the user endpoints is `{"user": {…}}`**: an object around the user, like suggest's `{"items": …}`. This is how I read the task's "`{user}`".
- **Small extra rules:** sign-up refuses the reserved `@demo.invalid` domain; a new sign-in deletes this browser's previous session; a `next` pointing at `/login` or `/register` also goes to `/` (no loop); the "Sign in" links (header and phone menu) carry `next` = the current page.
- **`testdb.Migrated` + a goose advisory lock:** the auth integration tests need only the schema, and two test packages may now migrate at the same time in CI.
- **The Origin check covers the whole API:** a POST without `Origin` to any `/api/*` path gets `403` (before 405/404). Two existing 405 tests now send a same-origin `Origin`.

## 6. Open questions
All answered by the owner in the review (2026-11-22):
1. **Third-party lockout:** **keep (a)**, per email. The trade-off and the production option (b: email + client IP) are documented in README ("Rate limit trade-off").
2. **Demo accounts pile up:** **no clean-up**; mentioned in README ("Shortcuts").

## 7. Self-review (task-reviewer)
The `task-reviewer` subagent got only the task number and the branch. It ran after the code and docs were committed and before this report was written. It is read-only and ran nothing.

**Verdict: PASS.** Every requirement (A1–A8, no-store, cart, migration, API, frontend, Go unit and integration tests, Vitest, docs) was marked "done". Two items were "pending" only because they live in this report: the browser verification evidence (now §2) and the owner steps (now §3). **CLAUDE.md violations:** none (go directive unchanged, structure, secrets, error handling, `apiFetch` only, tokens and breakpoints, migration only adds tables, DATA_MODEL updated). **Scope creep:** none needing action.

| Finding / observation | What was done |
|---|---|
| The phone menu's "Sign in" went to plain `/login`, while the header link keeps `?next=` | **Fixed:** "Sign in" and "Create account" in the phone menu carry `next` = the current page (`MenuDrawer.tsx`, test updated) |
| `golang.org/x/sys` v0.41.0 → v0.47.0: forced by x/crypto, or a side effect? | Forced: `go mod graph` shows `golang.org/x/crypto@v0.55.0 golang.org/x/sys@v0.47.0`. Noted in §1 |
| The Origin check makes a POST without `Origin` to any `/api/*` path a 403 (before 405/404) | Intended (A5 says every state-changing request); listed in §5 |
| Small extras (log prefix `api:`, Vite proxy, `testdb.Migrated`, 204 handling, DESIGN research note) | Each is needed by the task and explained in §5 and in the code comments |
| Report, owner steps first, comparison table, the lockout trade-off, session log | Report: this file (§3 starts with the production migration, §2 has the table, §6.1 the trade-off). Session log: the owner runs `/export` (§3.5) |
