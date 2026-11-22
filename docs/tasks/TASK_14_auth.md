# Task 14 – Authentication: register, sign in, sign out, demo user, protected routes

**Model:** Opus · **Effort:** high
Runs in parallel with Task 13c (small search follow-up in a worktree). This PR has a **migration** → before merging, the owner runs *Migrate production* from this branch (CLAUDE.md).

## Goal
Visitors can create an account and sign in; checkout (later) and order history are only for signed-in users. Secure by default, simple to explain.

## Decisions (made by the owner – do not change)
- **A1.** Email + password (8–128 characters), sign out. No email verification (simulated), no password reset (list as a shortcut in README).
- **A2.** Passwords hashed with **argon2id** (`golang.org/x/crypto/argon2`, OWASP parameters m=19 MiB, t=2, p=1, 16-byte salt, PHC-style encoded string with the parameters, constant-time compare). Login with an unknown email still runs one hash, so response time does not reveal which emails exist.
- **A3.** Session = 32 random bytes (`crypto/rand`), sent as cookie `session` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` 7 days). The DB stores only **SHA-256 of the token**. Expired sessions are rejected and deleted lazily. Sign out deletes the session row and clears the cookie.
- **A4.** **"Sign in as demo user"** creates a **new temporary demo account** on every click (`is_demo = true`, generated email on a reserved domain such as `demo-<random>@demo.invalid`, no password = cannot be used to sign in with a password) and signs it in. So every reviewer sees only their own orders. UI shows it as "Demo user".
- **A5.** CSRF: `SameSite=Lax` cookie **plus** an `Origin` check on every state-changing request (POST/PUT/PATCH/DELETE): the `Origin` host must equal the request's host (on Vercel use the forwarded host). Missing or foreign `Origin` → `403`. Unit-test it.
- **A6.** Rate limit: max **10 failed sign-ins per email per 15 minutes** → `429` with `Retry-After`. Must work on serverless (many instances) → keep the counter **in the database**, not in memory. A successful sign-in clears it.
- **A7.** Errors never reveal whether an email is registered: sign-in failure is always `401 "Invalid email or password"`. Registration with a taken email → `409 "An account with this email already exists"` (unavoidable on sign-up; acceptable).
- **A8.** UI: sign-in and register pages in Eneba's style (compare with eneba.com's login/register, CLAUDE.md rule); "Sign in as demo user" prominent on the sign-in page; when signed in, the header shows an account menu (email or "Demo user", "Orders", "Sign out") instead of "Sign in". `/orders` (and later `/checkout`) require sign-in: not signed in → `/login?next=/orders`, after sign-in go back to `next`. **`next` must be a same-site path** (starts with `/`, not `//`, no scheme) – otherwise go to `/` (open-redirect protection, test it).
- Responses with user data and all `/api/auth/*` responses: `Cache-Control: no-store`. Catalog responses stay public-cacheable and must never depend on the cookie.
- The cart stays in localStorage on sign-in/sign-out.

## 1. Branch
Standard workflow from `CLAUDE.md` (`task/14-auth`).

## 2. Database – migration `00004`
`users` (id, `email citext UNIQUE`, `password_hash` NULL only for demo users – CHECK, `is_demo`, `created_at`), `sessions` (`token_hash bytea PK`, `user_id` → users `ON DELETE CASCADE`, `created_at`, `expires_at`, index on `user_id` and `expires_at`), the failed-login counter table (design it, explain). Follow `docs/DATA_MODEL.md` (planned tables) and update it.

## 3. API
- `POST /api/auth/register` `{email, password}` → `201 {user}` + cookie · `400` validation · `409` taken.
- `POST /api/auth/login` `{email, password}` → `200 {user}` + cookie · `401` · `429`.
- `POST /api/auth/logout` → `204`, cookie cleared (also fine when already signed out).
- `POST /api/auth/demo` → `201 {user}` + cookie.
- `GET /api/auth/me` → `200 {user}` or `401`.
- `user` = `{ id, email, isDemo }` (camelCase). Never return the hash.
- Middleware/helper that loads the current user from the cookie, and `requireUser` for protected endpoints (used by the checkout/orders tasks). Handlers depend on small interfaces (like `CatalogReader`), DB errors follow the 503/500 rules.

## 4. Frontend
- `src/api/auth.ts` (+ types), `useCurrentUser()` (TanStack Query on `/api/auth/me`; `401` → `null`, not an error), mutations that update/invalidate it.
- Pages `/login` and `/register`: labelled inputs, correct `autocomplete` (`email`, `current-password`, `new-password`), show/hide password, inline validation, server errors shown, loading state, link between the two pages, demo button.
- Header account menu (keyboard accessible, Esc closes), phone menu shows the same.
- `RequireAuth` route wrapper for `/orders` (still a placeholder page, now showing "Signed in as …").

## 5. Tests
- Go unit: password hash/verify (wrong password, tampered encoded string), token hashing, cookie attributes, `Origin` check (same host, foreign, missing, forwarded host), validation, `next`-style inputs where relevant.
- Go integration (CI DB): register → me → logout → me 401; duplicate email 409 (case-insensitive); wrong password 401 with the generic text; 11th failure → 429; success clears the counter; two demo clicks → two different users; expired session → 401; deleting a user deletes its sessions.
- Vitest: `next` sanitizer, login/register forms (validation, errors, redirect to `next`), header menu signed in/out, `RequireAuth` redirect.

## 6. Verify
Standard checks; real browser against local API (`dev`): register, sign out, sign in, demo user, protected `/orders` redirect and return, cookie flags visible in DevTools (HttpOnly, Secure, SameSite=Lax), `Origin` check (a `curl` POST with a foreign Origin → 403). axe 0 on both auth pages and the open account menu. Comparison table vs eneba.com.

## 7. Docs
README: auth section + shortcuts (no email verification / password reset). `docs/PAAISKINIMAI_LT.md`: argon2id and why not plain SHA; why only the token's hash is stored; cookie flags; CSRF (SameSite + Origin); rate limit in the DB on serverless; generic errors and timing; demo accounts; open-redirect protection for `next`.

## 8. Owner steps (list them in the report)
Before merge: *Actions → Migrate production* from `task/14-auth` → `00004` applied. Then merge.

## Report
As defined in `CLAUDE.md` (incl. comparison table, Self-review). Export the session log at the end and commit it on this branch.
