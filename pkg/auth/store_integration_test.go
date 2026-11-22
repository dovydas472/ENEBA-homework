package auth_test

// Integration tests: the real auth.Store against a real Postgres (pkg/testdb,
// schema only - the catalog is not touched). Skipped when TEST_DATABASE_URL is
// empty; CI's `migrations` job runs them. Every test makes its own users with
// unique emails, so the tests do not depend on each other or on the order.

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dovydas472/ENEBA-homework/pkg/auth"
	"github.com/dovydas472/ENEBA-homework/pkg/testdb"
)

func newStore(t *testing.T) (*auth.Store, *pgxpool.Pool) {
	t.Helper()
	pool := testdb.Migrated(t)
	return auth.NewStoreFromPool(pool), pool
}

// uniqueEmail returns an email no other test (or earlier run) has used.
func uniqueEmail(t *testing.T) string {
	t.Helper()
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return "user-" + hex.EncodeToString(b) + "@example.com"
}

const fakeHash = "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

func TestStore_createUser_emailIsCaseInsensitive(t *testing.T) {
	s, _ := newStore(t)
	ctx := context.Background()
	email := uniqueEmail(t)

	u, err := s.CreateUser(ctx, email, fakeHash)
	if err != nil {
		t.Fatal(err)
	}
	if u.ID == 0 || u.Email != email || u.IsDemo {
		t.Fatalf("user = %+v", u)
	}
	if _, err := s.CreateUser(ctx, strings.ToUpper(email), fakeHash); !errors.Is(err, auth.ErrEmailTaken) {
		t.Fatalf("same email in upper case: err = %v, want ErrEmailTaken", err)
	}

	got, hash, err := s.UserByEmail(ctx, strings.ToUpper(email))
	if err != nil || got != u || hash != fakeHash {
		t.Fatalf("UserByEmail = %+v, %q, %v", got, hash, err)
	}
	if _, _, err := s.UserByEmail(ctx, uniqueEmail(t)); !errors.Is(err, auth.ErrUserNotFound) {
		t.Fatalf("unknown email: err = %v, want ErrUserNotFound", err)
	}
}

func TestStore_demoUsersAreNewAndPasswordless(t *testing.T) {
	s, _ := newStore(t)
	ctx := context.Background()
	a, err := s.CreateDemoUser(ctx)
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.CreateDemoUser(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if a.ID == b.ID || a.Email == b.Email {
		t.Fatalf("two demo clicks gave the same account: %+v / %+v", a, b)
	}
	for _, u := range []auth.User{a, b} {
		if !u.IsDemo || !strings.HasPrefix(u.Email, "demo-") || !strings.HasSuffix(u.Email, "@demo.invalid") {
			t.Fatalf("demo user = %+v", u)
		}
		if _, hash, err := s.UserByEmail(ctx, u.Email); err != nil || hash != "" {
			t.Fatalf("demo user's hash = %q, %v; want none", hash, err)
		}
	}
}

// The CHECK constraints keep "no password" and "demo" tied together.
func TestStore_passwordOnlyForRealAccounts(t *testing.T) {
	_, pool := newStore(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `INSERT INTO users (email, password_hash, is_demo) VALUES ($1, NULL, false)`, uniqueEmail(t)); err == nil {
		t.Error("a normal account without a password was accepted")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO users (email, password_hash, is_demo) VALUES ($1, $2, true)`, uniqueEmail(t), fakeHash); err == nil {
		t.Error("a demo account with a password was accepted")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO users (email, password_hash) VALUES ($1, 'plain-text')`, uniqueEmail(t)); err == nil {
		t.Error("a password_hash that is not argon2id was accepted")
	}
}

func TestStore_sessionLifecycle(t *testing.T) {
	s, pool := newStore(t)
	ctx := context.Background()
	u, err := s.CreateUser(ctx, uniqueEmail(t), fakeHash)
	if err != nil {
		t.Fatal(err)
	}
	token, hash, _ := auth.NewSessionToken()
	if err := s.CreateSession(ctx, u.ID, hash); err != nil {
		t.Fatal(err)
	}

	// The database holds only the hash, valid for 7 days.
	var stored []byte
	var ttl time.Duration
	if err := pool.QueryRow(ctx, `SELECT token_hash, expires_at - created_at FROM sessions WHERE user_id = $1`, u.ID).Scan(&stored, &ttl); err != nil {
		t.Fatal(err)
	}
	if string(stored) == token || len(stored) != 32 || ttl != auth.SessionTTL {
		t.Fatalf("stored %d bytes, ttl %v", len(stored), ttl)
	}

	got, err := s.UserBySession(ctx, hash)
	if err != nil || got != u {
		t.Fatalf("UserBySession = %+v, %v; want %+v", got, err, u)
	}

	if err := s.DeleteSession(ctx, hash); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserBySession(ctx, hash); !errors.Is(err, auth.ErrNoSession) {
		t.Fatalf("after delete: err = %v, want ErrNoSession", err)
	}
	if err := s.DeleteSession(ctx, hash); err != nil {
		t.Fatalf("deleting twice must be fine: %v", err)
	}
}

func TestStore_expiredSessionIsRejectedAndDeleted(t *testing.T) {
	s, pool := newStore(t)
	ctx := context.Background()
	u, _ := s.CreateUser(ctx, uniqueEmail(t), fakeHash)
	_, hash, _ := auth.NewSessionToken()
	if err := s.CreateSession(ctx, u.ID, hash); err != nil {
		t.Fatal(err)
	}
	expireSession(t, pool, hash)

	if _, err := s.UserBySession(ctx, hash); !errors.Is(err, auth.ErrNoSession) {
		t.Fatalf("expired session: err = %v, want ErrNoSession", err)
	}
	if n := count(t, pool, `SELECT count(*) FROM sessions WHERE token_hash = $1`, hash); n != 0 {
		t.Fatal("the expired session row was not deleted")
	}
}

// expireSession moves a session 8 days into the past (created 8 days ago, expired 1 day ago).
func expireSession(t *testing.T, pool *pgxpool.Pool, hash []byte) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), `
		UPDATE sessions SET created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
		WHERE token_hash = $1`, hash); err != nil {
		t.Fatal(err)
	}
}

func count(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// A new session cleans up every expired one (lazy clean-up, no cron).
func TestStore_createSessionDeletesExpiredOnes(t *testing.T) {
	s, pool := newStore(t)
	ctx := context.Background()
	u, _ := s.CreateUser(ctx, uniqueEmail(t), fakeHash)
	_, old, _ := auth.NewSessionToken()
	_ = s.CreateSession(ctx, u.ID, old)
	expireSession(t, pool, old)

	_, fresh, _ := auth.NewSessionToken()
	if err := s.CreateSession(ctx, u.ID, fresh); err != nil {
		t.Fatal(err)
	}
	if n := count(t, pool, `SELECT count(*) FROM sessions WHERE token_hash = $1`, old); n != 0 {
		t.Fatal("the expired session was not cleaned up")
	}
}

func TestStore_deletingAUserDeletesItsSessions(t *testing.T) {
	s, pool := newStore(t)
	ctx := context.Background()
	u, _ := s.CreateUser(ctx, uniqueEmail(t), fakeHash)
	for range 2 {
		_, hash, _ := auth.NewSessionToken()
		if err := s.CreateSession(ctx, u.ID, hash); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, u.ID); err != nil {
		t.Fatal(err)
	}
	if n := count(t, pool, `SELECT count(*) FROM sessions WHERE user_id = $1`, u.ID); n != 0 {
		t.Fatalf("%d sessions survived their user (want ON DELETE CASCADE)", n)
	}
}

func TestStore_loginAttemptCounter(t *testing.T) {
	s, pool := newStore(t)
	ctx := context.Background()
	email := uniqueEmail(t) // the counter works for emails without an account too

	attempt := func(e string) (int, time.Duration) {
		t.Helper()
		n, d, err := s.CountLoginAttempt(ctx, e)
		if err != nil {
			t.Fatal(err)
		}
		return n, d
	}
	for want := 1; want <= auth.MaxFailedLogins; want++ {
		if n, _ := attempt(email); n != want {
			t.Fatalf("attempt number = %d, want %d", n, want)
		}
	}
	n, d := attempt(strings.ToUpper(email)) // other letter case: same counter
	if n != auth.MaxFailedLogins+1 || d <= 0 || d > auth.FailureWindow {
		t.Fatalf("11th attempt: n=%d retryAfter=%v", n, d)
	}

	// The window ended: the next attempt starts a new window at 1.
	if _, err := pool.Exec(ctx, `UPDATE login_failures SET window_start = now() - interval '16 minutes' WHERE email = $1`, email); err != nil {
		t.Fatal(err)
	}
	if n, _ := attempt(email); n != 1 {
		t.Fatalf("first attempt of a new window = %d, want 1", n)
	}

	if err := s.ClearLoginFailures(ctx, email); err != nil {
		t.Fatal(err)
	}
	if n := count(t, pool, `SELECT count(*) FROM login_failures WHERE email = $1`, email); n != 0 {
		t.Fatal("ClearLoginFailures left the row")
	}
}

// Parallel attempts are numbered 1..N without gaps or repeats (no lost updates),
// so a burst cannot get more than MaxFailedLogins password checks.
func TestStore_parallelAttemptsAreAllCounted(t *testing.T) {
	s, _ := newStore(t)
	email := uniqueEmail(t)
	const n = 20
	got := make(chan int, n)
	errs := make(chan error, n)
	for range n {
		go func() {
			a, _, err := s.CountLoginAttempt(context.Background(), email)
			got <- a
			errs <- err
		}()
	}
	seen := map[int]bool{}
	for range n {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
		seen[<-got] = true
	}
	for i := 1; i <= n; i++ {
		if !seen[i] {
			t.Fatalf("attempt numbers %v: %d is missing", seen, i)
		}
	}
}
