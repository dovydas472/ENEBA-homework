-- +goose Up
-- Accounts and sign-in (Task 14). Design and reasons: docs/DATA_MODEL.md ("Auth tables").
--
-- Only NEW tables -> backward compatible with the deployed code (expand/contract):
-- the code that is live while this runs never reads them.
-- citext comes from 00001_extensions.sql.

-- One row per account. A demo account (Task 14, A4) is created by the
-- "Sign in as demo user" button: it has no password, so nobody can sign in to it
-- with a password - only the browser that created it holds its session.
CREATE TABLE users (
    id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- citext: "Jon@x.com" and "jon@x.com" are the same account; UNIQUE enforces it.
    email         citext      NOT NULL UNIQUE,
    -- argon2id PHC string ("$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>"); never the password.
    password_hash text,
    is_demo       boolean     NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_shape CHECK (length(email) <= 254 AND position('@' IN email) > 1),
    -- "No password" if and only if "demo": a normal account always has a hash,
    -- a demo account never has one.
    CONSTRAINT users_password_only_for_real_accounts CHECK ((password_hash IS NULL) = is_demo),
    CONSTRAINT users_password_hash_is_argon2id CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%')
);

-- One row per signed-in browser. The cookie holds a random 32-byte token; the
-- table holds only its SHA-256, so a leaked table cannot be used as cookies.
-- The hash itself is the key: every request looks the session up by it.
CREATE TABLE sessions (
    token_hash bytea       PRIMARY KEY,
    -- The one CASCADE in the schema: sessions are throw-away login state, not history.
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CONSTRAINT sessions_token_hash_is_sha256 CHECK (octet_length(token_hash) = 32),
    CONSTRAINT sessions_expire_after_creation CHECK (expires_at > created_at)
);
-- "Sessions of a user" (sign out everywhere, the CASCADE delete) and the clean-up of expired rows.
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Failed sign-ins per email (rate limit, Task 14 A6): at most 10 failures in a
-- 15-minute window. It lives in the database, not in memory, because on Vercel
-- every request may hit a different function instance.
-- The key is the TYPED email, not users.id: unknown emails are counted too,
-- otherwise "429" vs "401" would reveal which emails have an account.
CREATE TABLE login_failures (
    email        citext      PRIMARY KEY,
    failed_count integer     NOT NULL,
    -- When the current 15-minute window started (the first failure in it).
    window_start timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT login_failures_count_positive CHECK (failed_count > 0)
);
-- Lets the clean-up delete expired windows without reading the whole table.
CREATE INDEX login_failures_window_start_idx ON login_failures (window_start);

-- +goose Down
DROP TABLE IF EXISTS login_failures;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
