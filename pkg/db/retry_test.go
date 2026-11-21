package db

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// timeoutErr is a net.Error that reports a timeout (like a dial that ran out of time).
type timeoutErr struct{}

func (timeoutErr) Error() string   { return "i/o timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

var _ net.Error = timeoutErr{}

func TestShouldRetryConnect(t *testing.T) {
	live := context.Background()
	expired, cancel := context.WithCancel(context.Background())
	cancel()

	tests := []struct {
		name string
		ctx  context.Context
		err  error
		want bool
	}{
		{"no error", live, nil, false},
		{"connect error (refused / unreachable)", live, &pgconn.ConnectError{}, true},
		{"wrapped connect error", live, fmt.Errorf("acquire: %w", &pgconn.ConnectError{}), true},
		{"dial timeout (net.Error)", live, fmt.Errorf("dial: %w", timeoutErr{}), true},
		{"connect timeout (deadline of the connect attempt)", live, context.DeadlineExceeded, true},
		{"server still starting (57P03)", live, &pgconn.PgError{Code: "57P03"}, true},
		{"connection exception class 08", live, &pgconn.PgError{Code: "08006"}, true},
		{"wrong password (28P01) will not fix itself", live, &pgconn.PgError{Code: "28P01"}, false},
		{"SQL error (syntax)", live, &pgconn.PgError{Code: "42601"}, false},
		{"missing table", live, &pgconn.PgError{Code: "42P01"}, false},
		{"plain unknown error", live, errors.New("boom"), false},
		{"config error", live, ErrNotConfigured, false},
		{"bad config", live, ErrBadConfig, false},
		{"request context already over: no time left", expired, &pgconn.ConnectError{}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldRetryConnect(tc.ctx, tc.err); got != tc.want {
				t.Errorf("shouldRetryConnect = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestIsUnavailable(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"marked unavailable", ErrUnavailable, true},
		{"wrapped unavailable", fmt.Errorf("catalog: %w", ErrUnavailable), true},
		{"DATABASE_URL missing", ErrNotConfigured, true},
		{"DATABASE_URL invalid", ErrBadConfig, true},
		{"pool could not be created", ErrPoolCreate, true},
		{"connect error", &pgconn.ConnectError{}, true},
		{"network error", fmt.Errorf("read: %w", timeoutErr{}), true},
		{"connection closed", fmt.Errorf("query: %w", pgconn.ErrConnClosed), true},
		{"server shutting down (57P01)", &pgconn.PgError{Code: "57P01"}, true},
		{"too many connections (53300)", &pgconn.PgError{Code: "53300"}, true},
		{"SQL error = bug", &pgconn.PgError{Code: "42P01"}, false},
		{"constraint violation", &pgconn.PgError{Code: "23505"}, false},
		{"query ran out of time (not connecting)", context.DeadlineExceeded, false},
		{"client went away", context.Canceled, false},
		{"unexpected EOF is not classified", io.ErrUnexpectedEOF, false},
		{"plain unknown error", errors.New("boom"), false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsUnavailable(tc.err); got != tc.want {
				t.Errorf("IsUnavailable = %v, want %v", got, tc.want)
			}
		})
	}
}

// fakeAcquirer returns the queued errors one per call (nil = success).
type fakeAcquirer struct {
	results []error
	calls   int
}

func (f *fakeAcquirer) Acquire(context.Context) (*pgxpool.Conn, error) {
	f.calls++
	err := f.results[min(f.calls, len(f.results))-1]
	return nil, err // the connection itself is irrelevant for these tests
}

func TestAcquire_retriesExactlyOnce(t *testing.T) {
	// A refused dial: a *net.OpError is a net.Error, which counts as a connection error.
	// (A zero *pgconn.ConnectError cannot be formatted, so it is not used here.)
	connErr := &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connection refused")}
	tests := []struct {
		name      string
		results   []error
		wantCalls int
		wantErr   bool
	}{
		{"first try works: no retry", []error{nil}, 1, false},
		{"connect error then success", []error{connErr, nil}, 2, false},
		{"connect error twice: give up after ONE retry", []error{connErr, connErr, nil}, 2, true},
		{"SQL-class error is not retried", []error{&pgconn.PgError{Code: "42601"}, nil}, 1, true},
		{"wrong password is not retried", []error{&pgconn.PgError{Code: "28P01"}, nil}, 1, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := &fakeAcquirer{results: tc.results}
			_, err := acquire(context.Background(), f, time.Millisecond)
			if f.calls != tc.wantCalls {
				t.Errorf("Acquire called %d times, want %d", f.calls, tc.wantCalls)
			}
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
			// Every failure to get a connection is reported as "database unavailable".
			if err != nil && !errors.Is(err, ErrUnavailable) {
				t.Errorf("err = %v, want it to wrap ErrUnavailable", err)
			}
		})
	}
}

func TestAcquire_noRetryWhenTheDeadlineIsTooClose(t *testing.T) {
	f := &fakeAcquirer{results: []error{timeoutErr{}, nil}}
	// The request has less time left than the retry delay: waiting is pointless.
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := acquire(ctx, f, time.Hour)
	if err == nil || f.calls != 1 {
		t.Fatalf("err = %v, calls = %d; want an error after exactly 1 call", err, f.calls)
	}
	if time.Since(start) > time.Second {
		t.Errorf("acquire waited %v instead of giving up at once", time.Since(start))
	}
}

func TestAcquire_stopsWaitingWhenContextEnds(t *testing.T) {
	f := &fakeAcquirer{results: []error{timeoutErr{}, nil}}
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(10 * time.Millisecond); cancel() }()
	start := time.Now()
	_, err := acquire(ctx, f, time.Hour)
	if err == nil || f.calls != 1 {
		t.Fatalf("err = %v, calls = %d; want an error after exactly 1 call", err, f.calls)
	}
	if time.Since(start) > time.Second {
		t.Errorf("acquire kept waiting %v after the context ended", time.Since(start))
	}
}

// countingPool wraps a real pool and counts Acquire calls.
type countingPool struct {
	*pgxpool.Pool
	calls int
}

func (c *countingPool) Acquire(ctx context.Context) (*pgxpool.Conn, error) {
	c.calls++
	return c.Pool.Acquire(ctx)
}

// Real driver, no database: nothing listens on port 1, so the connect fails the
// way a down database does. This proves the classification works on the real
// pgx error and not only on the hand-made ones above.
func TestAcquire_realRefusedConnection(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, "postgres://u:p@127.0.0.1:1/x?sslmode=disable&connect_timeout=2")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	cp := &countingPool{Pool: pool}
	_, err = acquire(ctx, cp, time.Millisecond)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err = %v, want ErrUnavailable", err)
	}
	if cp.calls != 2 {
		t.Errorf("Acquire called %d times, want 2 (first try + one retry)", cp.calls)
	}
	var connErr *pgconn.ConnectError
	if !errors.As(err, &connErr) {
		t.Errorf("expected the real driver error to be a *pgconn.ConnectError, got %T", errors.Unwrap(err))
	}
	if !IsUnavailable(err) {
		t.Error("IsUnavailable = false for a refused connection")
	}
}

// The numbers must leave room for one retry inside one request (<= 10 s).
func TestTimeoutBudget(t *testing.T) {
	worst := 2*ConnectTimeout + RetryDelay // two connect attempts and the pause between them
	if worst >= RequestTimeout {
		t.Errorf("two connect attempts (%v) do not fit into the request timeout (%v)", worst, RequestTimeout)
	}
	if RequestTimeout > 10*time.Second {
		t.Errorf("RequestTimeout = %v, the agreed total is <= 10 s", RequestTimeout)
	}
}
