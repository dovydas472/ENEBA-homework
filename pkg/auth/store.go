package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dovydas472/ENEBA-homework/pkg/db"
)

// Rate limit of failed sign-ins (owner decision A6): at most MaxFailedLogins
// failures per email within FailureWindow. The next attempt gets HTTP 429.
const (
	MaxFailedLogins = 10
	FailureWindow   = 15 * time.Minute
)

// User is the public view of an account - exactly what the API returns.
// The password hash is deliberately NOT a field, so it can never be serialised by mistake.
type User struct {
	ID     int64  `json:"id"`
	Email  string `json:"email"`
	IsDemo bool   `json:"isDemo"`
}

var (
	// ErrEmailTaken: sign-up with an email that already has an account (UNIQUE on users.email).
	ErrEmailTaken = errors.New("auth: email already registered")
	// ErrUserNotFound: no account with this email.
	ErrUserNotFound = errors.New("auth: user not found")
	// ErrNoSession: the token is unknown or its session has expired.
	ErrNoSession = errors.New("auth: no valid session")
)

// ConnSource hands the Store a database connection (same contract as in
// pkg/catalog): *db.Lazy implements it, with the one cold-start retry.
type ConnSource interface {
	Acquire(ctx context.Context) (*pgxpool.Conn, error)
}

type fixedPool struct{ p *pgxpool.Pool }

func (f fixedPool) Acquire(ctx context.Context) (*pgxpool.Conn, error) { return db.Acquire(ctx, f.p) }

// Store runs the auth queries. Like catalog.Store, all SQL is constant text and
// user input only travels as query parameters.
type Store struct{ src ConnSource }

// NewStore builds a Store on a (lazy) connection source.
func NewStore(src ConnSource) *Store { return &Store{src: src} }

// NewStoreFromPool builds a Store on a ready pool (tests).
func NewStoreFromPool(p *pgxpool.Pool) *Store { return &Store{src: fixedPool{p}} }

// uniqueViolation is the SQLSTATE of a UNIQUE constraint failure.
const uniqueViolation = "23505"

// CreateUser inserts a normal account. A taken email (in any letter case,
// citext) returns ErrEmailTaken. The UNIQUE constraint decides, not an earlier
// SELECT, so two sign-ups racing for one email cannot both succeed.
func (s *Store) CreateUser(ctx context.Context, email, passwordHash string) (User, error) {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return User{}, err
	}
	defer conn.Release()

	var u User
	err = conn.QueryRow(ctx, `
		INSERT INTO users (email, password_hash) VALUES ($1, $2)
		RETURNING id, email::text, is_demo`, email, passwordHash).Scan(&u.ID, &u.Email, &u.IsDemo)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
		return User{}, ErrEmailTaken
	}
	if err != nil {
		return User{}, fmt.Errorf("auth: create user: %w", err)
	}
	return u, nil
}

// CreateDemoUser inserts a NEW demo account (owner decision A4): is_demo = true,
// no password, a random email on the reserved demo domain. Every click makes a
// fresh one, so every reviewer only ever sees their own orders.
func (s *Store) CreateDemoUser(ctx context.Context) (User, error) {
	random := make([]byte, 8) // 64 bits: a collision is practically impossible
	if _, err := rand.Read(random); err != nil {
		return User{}, fmt.Errorf("auth: demo email: %w", err)
	}
	email := "demo-" + hex.EncodeToString(random) + "@" + DemoEmailDomain

	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return User{}, err
	}
	defer conn.Release()

	var u User
	err = conn.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, is_demo) VALUES ($1, NULL, true)
		RETURNING id, email::text, is_demo`, email).Scan(&u.ID, &u.Email, &u.IsDemo)
	if err != nil {
		return User{}, fmt.Errorf("auth: create demo user: %w", err)
	}
	return u, nil
}

// UserByEmail returns the account and its password hash for sign-in.
// passwordHash is "" for a demo account (NULL in the database): such an account
// cannot be signed in to with a password. Unknown email -> ErrUserNotFound.
func (s *Store) UserByEmail(ctx context.Context, email string) (u User, passwordHash string, err error) {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return User{}, "", err
	}
	defer conn.Release()

	var hash *string
	err = conn.QueryRow(ctx, `
		SELECT id, email::text, is_demo, password_hash FROM users WHERE email = $1`, email).
		Scan(&u.ID, &u.Email, &u.IsDemo, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, "", ErrUserNotFound
	}
	if err != nil {
		return User{}, "", fmt.Errorf("auth: user by email: %w", err)
	}
	if hash != nil {
		passwordHash = *hash
	}
	return u, passwordHash, nil
}

// CreateSession stores a new session (only the token's hash) that expires
// after SessionTTL. The same batch first deletes every expired session: that
// is the lazy clean-up (no cron job), cheap thanks to sessions_expires_at_idx.
// pgx sends a batch as one implicit transaction, so both happen or neither.
func (s *Store) CreateSession(ctx context.Context, userID int64, tokenHash []byte) error {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	batch := &pgx.Batch{}
	batch.Queue(`DELETE FROM sessions WHERE expires_at <= now()`)
	batch.Queue(`
		INSERT INTO sessions (token_hash, user_id, expires_at)
		VALUES ($1, $2, now() + make_interval(secs => $3::integer))`,
		tokenHash, userID, int(SessionTTL.Seconds()))
	if err := conn.SendBatch(ctx, batch).Close(); err != nil {
		return fmt.Errorf("auth: create session: %w", err)
	}
	return nil
}

// UserBySession returns the signed-in user for a token hash.
// Unknown token -> ErrNoSession. An EXPIRED session is rejected the same way
// and its row is deleted right away (lazy expiry).
func (s *Store) UserBySession(ctx context.Context, tokenHash []byte) (User, error) {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return User{}, err
	}
	defer conn.Release()

	var u User
	var valid bool
	err = conn.QueryRow(ctx, `
		SELECT u.id, u.email::text, u.is_demo, s.expires_at > now()
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1`, tokenHash).Scan(&u.ID, &u.Email, &u.IsDemo, &valid)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNoSession
	}
	if err != nil {
		return User{}, fmt.Errorf("auth: session lookup: %w", err)
	}
	if !valid {
		if _, err := conn.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, tokenHash); err != nil {
			return User{}, fmt.Errorf("auth: delete expired session: %w", err)
		}
		return User{}, ErrNoSession
	}
	return u, nil
}

// DeleteSession removes one session (sign out). Deleting a session that does
// not exist is not an error: signing out twice is fine.
func (s *Store) DeleteSession(ctx context.Context, tokenHash []byte) error {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, tokenHash); err != nil {
		return fmt.Errorf("auth: delete session: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Failed sign-ins (rate limit, A6). One row per typed email in login_failures.
// The window is FIXED: it starts at the first attempt and lasts FailureWindow;
// after that the next attempt starts a new window with count 1.
//
// Every attempt is counted BEFORE its password is checked, in one atomic
// statement, and a successful sign-in deletes the row. Counting first matters:
// with "check, then verify, then count the failure", 50 parallel requests
// would all pass the check before any failure was written, and get 50 guesses.
// Counted first, request number 11 always sees 11, however many run at once.
// ---------------------------------------------------------------------------

// CountLoginAttempt counts one sign-in attempt for the email and returns its
// number in the current window. attempt > MaxFailedLogins means "refuse with
// 429"; retryAfter is then the time until the window ends (at least 1 s).
//
// The batch first deletes every window that has ended (also this email's old
// one), so the INSERT starts a fresh window with count 1 and the table does
// not keep rows for emails that someone mistyped once. INSERT ... ON CONFLICT
// DO UPDATE locks the row, so two attempts at the same moment get 1 and 2,
// never 1 and 1.
func (s *Store) CountLoginAttempt(ctx context.Context, email string) (attempt int, retryAfter time.Duration, err error) {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return 0, 0, err
	}
	defer conn.Release()

	window := int(FailureWindow.Seconds())
	batch := &pgx.Batch{}
	batch.Queue(`DELETE FROM login_failures WHERE window_start <= now() - make_interval(secs => $1::integer)`, window)
	batch.Queue(`
		INSERT INTO login_failures AS f (email, attempt_count) VALUES ($1, 1)
		ON CONFLICT (email) DO UPDATE SET attempt_count = f.attempt_count + 1
		RETURNING f.attempt_count,
		          extract(epoch FROM f.window_start + make_interval(secs => $2::integer) - now())::float8`,
		email, window)
	br := conn.SendBatch(ctx, batch)
	defer br.Close()

	if _, err := br.Exec(); err != nil {
		return 0, 0, fmt.Errorf("auth: clean up login windows: %w", err)
	}
	var secondsLeft float64
	if err := br.QueryRow().Scan(&attempt, &secondsLeft); err != nil {
		return 0, 0, fmt.Errorf("auth: count login attempt: %w", err)
	}
	retryAfter = time.Duration(secondsLeft * float64(time.Second))
	if retryAfter < time.Second {
		retryAfter = time.Second
	}
	return attempt, retryAfter, br.Close()
}

// ClearLoginFailures forgets the attempts of an email after a successful sign-in (A6).
func (s *Store) ClearLoginFailures(ctx context.Context, email string) error {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, `DELETE FROM login_failures WHERE email = $1`, email); err != nil {
		return fmt.Errorf("auth: clear login failures: %w", err)
	}
	return nil
}
