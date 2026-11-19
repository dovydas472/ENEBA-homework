// Package db owns the Postgres (Neon) connection pool.
package db

import (
	"context"
	"errors"
	"log"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Errors are deliberately generic: raw driver/parse errors can contain host
// names or fragments of the connection string, so they are never passed on.
var (
	ErrNotConfigured = errors.New("db: DATABASE_URL is not set")
	ErrBadConfig     = errors.New("db: DATABASE_URL is invalid")
	ErrPoolCreate    = errors.New("db: cannot create connection pool")
)

// Lazy is a connection pool that is created on first use, exactly once per
// process, and then reused by every request.
//
// Why lazy + once: on Vercel a warm function instance serves many requests,
// so keeping the pool in a long-lived variable avoids reconnecting each time.
// Lazy (instead of at start-up) means a missing DATABASE_URL does not crash
// the whole function - only the DB-dependent calls report an error.
type Lazy struct {
	once sync.Once
	pool *pgxpool.Pool
	err  error
}

// NewLazy returns an empty holder; nothing connects until the first Ping/Pool call.
func NewLazy() *Lazy { return &Lazy{} }

// Pool returns the shared pool, creating it on the first call.
// The creation error (if any) is remembered: it is a config problem, which
// cannot fix itself without a restart/redeploy.
func (l *Lazy) Pool() (*pgxpool.Pool, error) {
	l.once.Do(func() {
		l.pool, l.err = newPool()
	})
	return l.pool, l.err
}

// Ping checks that the database answers. It satisfies server.DBPinger.
// The first call after a Neon compute suspend can be slow, so the caller
// should pass a context with a generous timeout.
func (l *Lazy) Ping(ctx context.Context) error {
	pool, err := l.Pool()
	if err != nil {
		return err
	}
	return pool.Ping(ctx)
}

// newPool reads DATABASE_URL and builds a pool with serverless-friendly settings.
func newPool() (*pgxpool.Pool, error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return nil, ErrNotConfigured
	}

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		// Log only the error class, not err itself (it may echo the URL).
		log.Printf("db: DATABASE_URL could not be parsed")
		return nil, ErrBadConfig
	}

	// MaxConns: keep it small. Every warm function instance has its own pool,
	// and Vercel can run many instances at once, so total connections to Neon
	// = instances x MaxConns. (The PgBouncer pooler absorbs part of this.)
	cfg.MaxConns = 4

	// MaxConnIdleTime: close connections idle for 30 s. Idle serverless
	// instances get frozen; a connection that sat frozen is likely dead on the
	// server side, so we do not want it to linger and fail the next request.
	cfg.MaxConnIdleTime = 30 * time.Second

	// ConnectTimeout: upper bound for opening ONE new connection (TCP + TLS +
	// auth). A Neon cold start can take a few seconds, but we never wait forever.
	cfg.ConnConfig.ConnectTimeout = 5 * time.Second

	// Query execution mode is left at pgx's default (protocol-level prepared
	// statements), which Neon's PgBouncer (transaction mode) supports.
	// We must not use session state (SET, LISTEN, SQL-level PREPARE).

	// NewWithConfig does not dial; connections are opened on demand.
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		log.Printf("db: pool creation failed")
		return nil, ErrPoolCreate
	}
	return pool, nil
}
