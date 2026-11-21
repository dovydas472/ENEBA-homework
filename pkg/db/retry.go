package db

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// Timeout budget (one place, so the numbers can be checked against each other)
//
//	connect attempt 1   up to ConnectTimeout  4 s   (Neon compute may still be waking up)
//	pause               RetryDelay            0.4 s
//	connect attempt 2   up to ConnectTimeout  4 s   (compute is awake by now -> fast)
//	query / ping                              ~1.6 s left
//	                                          -------
//	RequestTimeout                            10 s  (deadline of the whole request's DB work)
//
// Vercel limit: vercel.json maxDuration = 15 s > RequestTimeout, so our own 503 always wins.
//
// Why a retry at all: the first request after a long idle meets a Vercel cold
// start AND a suspended Neon compute. The first connect attempt wakes the
// compute but can run out of time; the second one finds it awake.
// ---------------------------------------------------------------------------
const (
	// ConnectTimeout bounds ONE attempt to open a connection (TCP + TLS + auth).
	ConnectTimeout = 4 * time.Second
	// RetryDelay is the pause before the single retry: long enough not to hammer
	// a database that is just starting, short enough not to eat the budget.
	RetryDelay = 400 * time.Millisecond
	// RequestTimeout is the deadline the handlers give to all DB work of one request.
	RequestTimeout = 10 * time.Second
)

// ErrUnavailable marks "the database could not be reached": no connection could
// be acquired (also after the retry). Handlers turn it into 503.
var ErrUnavailable = errors.New("db: database unavailable")

// connAcquirer is the one method of *pgxpool.Pool that acquire needs. A small
// interface lets the unit tests use a fake instead of a real database.
type connAcquirer interface {
	Acquire(ctx context.Context) (*pgxpool.Conn, error)
}

// Acquire gets a connection from the pool. If opening it fails with a
// connection/timeout error, it waits RetryDelay and tries exactly once more.
// It is the only place that retries.
func Acquire(ctx context.Context, p *pgxpool.Pool) (*pgxpool.Conn, error) {
	return acquire(ctx, p, RetryDelay)
}

// acquire is Acquire with the delay as a parameter (tests use a tiny one).
//
// Why this is safe to retry: Acquire only hands out a connection, it runs no
// SQL. A failure here means "no statement has been sent yet", so trying again
// can never execute anything twice. Retrying a statement that already ran
// (a failed query, a dropped connection mid-query) is deliberately NOT done.
func acquire(ctx context.Context, a connAcquirer, delay time.Duration) (*pgxpool.Conn, error) {
	conn, err := a.Acquire(ctx)
	if err == nil {
		return conn, nil
	}
	if !shouldRetryConnect(ctx, err) || !timeLeftFor(ctx, delay) {
		return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}

	select {
	case <-time.After(delay):
	case <-ctx.Done(): // the request ended while we were waiting
		return nil, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}

	conn, err = a.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnavailable, err) // second failure: give up
	}
	return conn, nil
}

// timeLeftFor reports whether the request still has more than d left, so that
// waiting d and trying again is not pointless.
func timeLeftFor(ctx context.Context, d time.Duration) bool {
	deadline, ok := ctx.Deadline()
	return !ok || time.Until(deadline) > d
}

// shouldRetryConnect decides whether a failed connection attempt is worth one
// more try. It says yes only for problems that can disappear on their own
// within a second or two (a suspended database waking up):
//   - the connection could not be made (refused, unreachable, ran out of time),
//   - the server answered "starting up" (57P03) or a connection-class error (08xxx).
//
// It says no for everything that a retry cannot fix: bad configuration, wrong
// password, SQL-level errors, or a request whose own context has already ended.
func shouldRetryConnect(ctx context.Context, err error) bool {
	if err == nil || ctx.Err() != nil {
		return false
	}
	if errors.Is(err, ErrNotConfigured) || errors.Is(err, ErrBadConfig) || errors.Is(err, ErrPoolCreate) {
		return false
	}
	// A server error (also one that wraps a *pgconn.ConnectError, e.g. a failed
	// login) is retried only if it is a transient one.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return transientPgCode(pgErr.Code)
	}
	var connErr *pgconn.ConnectError
	if errors.As(err, &connErr) {
		return true
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	// The connect attempt's own ConnectTimeout (the request context is still alive here).
	return errors.Is(err, context.DeadlineExceeded)
}

// transientPgCode: SQLSTATEs that mean "the server cannot take connections right now".
//
//	08xxx  connection exception
//	57P01  admin_shutdown, 57P02 crash_shutdown, 57P03 cannot_connect_now (starting up)
//	53300  too_many_connections
func transientPgCode(code string) bool {
	return strings.HasPrefix(code, "08") ||
		code == "57P01" || code == "57P02" || code == "57P03" ||
		code == "53300"
}

// IsUnavailable reports whether err means "the database is unreachable or
// unavailable" (an INFRASTRUCTURE problem -> HTTP 503), as opposed to any other
// unexpected error such as a SQL error (a BUG in our code -> HTTP 500).
//
// A query that merely ran out of time (context.DeadlineExceeded) is NOT
// "unavailable": the database answered, it was just slow. Only the connect
// phase counts as unreachable, and that is already wrapped in ErrUnavailable
// by Acquire.
func IsUnavailable(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ErrUnavailable) || errors.Is(err, ErrNotConfigured) ||
		errors.Is(err, ErrBadConfig) || errors.Is(err, ErrPoolCreate) {
		return true
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return transientPgCode(pgErr.Code)
	}
	var connErr *pgconn.ConnectError
	if errors.As(err, &connErr) {
		return true
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	return errors.Is(err, pgconn.ErrConnClosed)
}
