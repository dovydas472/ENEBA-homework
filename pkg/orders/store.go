package orders

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dovydas472/ENEBA-homework/pkg/db"
)

// ConnSource hands the Store a database connection (same contract as in pkg/catalog and
// pkg/auth): *db.Lazy implements it, with the one cold-start retry.
type ConnSource interface {
	Acquire(ctx context.Context) (*pgxpool.Conn, error)
}

type fixedPool struct{ p *pgxpool.Pool }

func (f fixedPool) Acquire(ctx context.Context) (*pgxpool.Conn, error) { return db.Acquire(ctx, f.p) }

// Store runs the checkout transactions. All SQL is constant text; user input only travels as
// query parameters. `now` is the clock: tests replace it (WithClock) to simulate the 15 minutes
// without sleeping. Every time comparison in this file uses it - never the database's now() -
// so a test that moves the clock moves ALL of them together.
type Store struct {
	src ConnSource
	now func() time.Time
}

// NewStore builds a Store on a (lazy) connection source, with the real clock.
func NewStore(src ConnSource) *Store { return &Store{src: src, now: time.Now} }

// NewStoreFromPool builds a Store on a ready pool (tests).
func NewStoreFromPool(p *pgxpool.Pool) *Store { return &Store{src: fixedPool{p}, now: time.Now} }

// WithClock returns a copy of the store that reads the time from now (tests).
func (s *Store) WithClock(now func() time.Time) *Store { return &Store{src: s.src, now: now} }

// clock reads the clock, in UTC and rounded to microseconds - the precision of timestamptz - so a
// time written to the database and read back is the same value.
func (s *Store) clock() time.Time { return s.now().UTC().Truncate(time.Microsecond) }

// querier is what a pool connection and a transaction have in common.
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// rollback ends a transaction that did not commit. After a successful Commit it does nothing, so
// `defer rollback(tx)` is always safe. It uses its own context: the request's may already be over.
func rollback(tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = tx.Rollback(ctx)
}

// sellableKey: a key that can be bought at time $2 - available, or reserved but the reservation
// has ended (P3, lazy expiry). Same meaning as pkg/catalog's sellableKey, with the injected time.
// "status <> 'sold'" is written like the predicate of keys_unsold_offer_idx so the index is used.
const sellableKey = `status <> 'sold' AND (reserved_until IS NULL OR reserved_until < $2)`

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

// Quote re-prices a cart (rules R1-R3): for every line, what can really be bought now and what
// differs from what the client expected. It reads only; it reserves nothing.
func (s *Store) Quote(ctx context.Context, items []CartItem) (Quote, error) {
	if err := ValidateItems(items); err != nil {
		return Quote{}, err
	}
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return Quote{}, err
	}
	defer conn.Release()

	lines, err := s.reviewLines(ctx, conn, items, s.clock(), nil)
	if err != nil {
		return Quote{}, err
	}
	return Quote{Lines: lines, TotalCents: TotalCents(lines)}, nil
}

// reviewLines reads the offers and their stock and applies ReviewLine to every item.
// capStock overrides the stock of an offer: CreateOrder uses it for a line where it could not
// reserve all it wanted, because keys that another in-flight order holds still LOOK available to a
// plain count (their reservation is not committed yet) - what we could actually take is the truth.
func (s *Store) reviewLines(ctx context.Context, q querier, items []CartItem, now time.Time, capStock map[int64]int) ([]Line, error) {
	ids := offerIDs(items)
	offers, err := loadOffers(ctx, q, ids, false)
	if err != nil {
		return nil, err
	}
	stock, err := stockCounts(ctx, q, ids, now)
	if err != nil {
		return nil, err
	}
	lines := make([]Line, len(items))
	for i, it := range items {
		var offer *OfferInfo
		if o, ok := offers[it.OfferID]; ok {
			offer = &o
		}
		n := stock[it.OfferID]
		if c, ok := capStock[it.OfferID]; ok {
			n = c
		}
		lines[i] = ReviewLine(it, offer, n)
	}
	return lines, nil
}

func offerIDs(items []CartItem) []int64 {
	ids := make([]int64, len(items))
	for i, it := range items {
		ids[i] = it.OfferID
	}
	return ids
}

// loadOffers reads the live price, state and snapshot text of offers. With lock = true (inside the
// create transaction) the rows are locked FOR SHARE: a seller cannot change the price between our
// comparison and our commit, while many buyers can lock the same offer at once (shares are compatible).
// Ordered by id so two transactions lock in the same order.
func loadOffers(ctx context.Context, q querier, ids []int64, lock bool) (map[int64]OfferInfo, error) {
	sql := `
		SELECT o.id, o.price_cents, o.is_active,
		       p.slug, g.title, p.edition, pl.name, r.name, s.name, g.cover_url
		FROM offers o
		JOIN products  p  ON p.id  = o.product_id
		JOIN games     g  ON g.id  = p.game_id
		JOIN platforms pl ON pl.id = p.platform_id
		JOIN regions   r  ON r.id  = p.region_id
		JOIN sellers   s  ON s.id  = o.seller_id
		WHERE o.id = ANY($1)
		ORDER BY o.id`
	if lock {
		sql += ` FOR SHARE OF o`
	}
	rows, err := q.Query(ctx, sql, ids)
	if err != nil {
		return nil, fmt.Errorf("orders: load offers: %w", err)
	}
	defer rows.Close()
	out := make(map[int64]OfferInfo, len(ids))
	for rows.Next() {
		var o OfferInfo
		if err := rows.Scan(&o.ID, &o.PriceCents, &o.Active, &o.ProductSlug, &o.Title, &o.Edition,
			&o.PlatformName, &o.RegionName, &o.SellerName, &o.CoverURL); err != nil {
			return nil, fmt.Errorf("orders: load offers: %w", err)
		}
		out[o.ID] = o
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("orders: load offers: %w", err)
	}
	return out, nil
}

// stockCounts counts the sellable keys of each offer at time now (an offer without any is absent = 0).
func stockCounts(ctx context.Context, q querier, ids []int64, now time.Time) (map[int64]int, error) {
	rows, err := q.Query(ctx, `
		SELECT offer_id, count(*) FROM keys
		WHERE offer_id = ANY($1) AND `+sellableKey+`
		GROUP BY offer_id`, ids, now)
	if err != nil {
		return nil, fmt.Errorf("orders: count stock: %w", err)
	}
	defer rows.Close()
	out := make(map[int64]int, len(ids))
	for rows.Next() {
		var id int64
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, fmt.Errorf("orders: count stock: %w", err)
		}
		out[id] = n
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("orders: count stock: %w", err)
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Create order
// ---------------------------------------------------------------------------

// CreateOrder turns a cart into a PENDING order and reserves its keys for 15 minutes, in ONE
// transaction: either the order, all its items and all its keys exist, or nothing does.
//
// Returns created = false when the same user already created an order with this idempotency key
// (rule R8): that order comes back and nothing new is reserved. When anything differs from what
// the client expected (R3) it returns *ChangedError and the database is untouched.
//
// Steps:
//  0. Lock the user's row, so that two creates of one user run one after the other.
//  1. Same (user, key) already an order? -> return it.
//     1b. The user already holds 3 open unpaid orders? -> ErrTooManyPending (rule R10).
//  2. Read + lock the offers (FOR SHARE): live price and state.
//  3. INSERT the order. The UNIQUE (user_id, idempotency_key) decides a race between two requests
//     with the same key: the second INSERT waits for the first, then does nothing (ON CONFLICT DO
//     NOTHING) and we return the first one's order. No advisory lock, no check-then-insert.
//  4. Per line: INSERT the order item, then take its keys (reserveKeys).
//  5. If any line differs from what the client expected, or got fewer keys than wanted -> ROLLBACK
//     (the order, items and reservations vanish) and report every line. Else COMMIT.
func (s *Store) CreateOrder(ctx context.Context, userID int64, req CreateRequest) (order Order, created bool, err error) {
	if err := ValidateItems(req.Items); err != nil {
		return Order{}, false, err
	}
	key, err := ValidateIdempotencyKey(req.IdempotencyKey)
	if err != nil {
		return Order{}, false, err
	}
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return Order{}, false, err
	}
	defer conn.Release()
	tx, err := conn.Begin(ctx)
	if err != nil {
		return Order{}, false, fmt.Errorf("orders: begin: %w", err)
	}
	defer rollback(tx)
	now := s.clock()

	// 0. Lock the USER row. Everything below counts what the user already holds, so two creates of
	// the same user must not run side by side: both would count 2 open orders and both would pass.
	// The second one waits here until the first has committed, then counts again and sees 3.
	// FOR NO KEY UPDATE conflicts with itself but not with the foreign-key checks that other
	// statements (a new session, our own order INSERT) take on the same user row, so nothing else stalls.
	if _, err := tx.Exec(ctx, `SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE`, userID); err != nil {
		return Order{}, false, fmt.Errorf("orders: lock user: %w", err)
	}

	// 1. A retry of an order that already exists. Before the cap: a retry creates nothing, so it
	// must be answered even when the user is at the cap right now.
	if id, found, err := orderIDByKey(ctx, tx, userID, key); err != nil {
		return Order{}, false, err
	} else if found {
		o, err := loadOrder(ctx, tx, userID, id, now)
		return o, false, err
	}

	// 1b. R10: at most 3 unpaid orders whose reservation is still running.
	var pending int
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM orders
		WHERE user_id = $1 AND status = 'pending' AND reserved_until > $2`, userID, now).Scan(&pending); err != nil {
		return Order{}, false, fmt.Errorf("orders: count pending orders: %w", err)
	}
	if PendingCapReached(pending) {
		return Order{}, false, ErrTooManyPending
	}

	// 2. The live offers, locked until we finish.
	offers, err := loadOffers(ctx, tx, offerIDs(req.Items), true)
	if err != nil {
		return Order{}, false, err
	}

	// Lines we can try to reserve = the offer exists and is active. The others are certain
	// failures (reported as "unavailable" below).
	total := 0
	var attempt []CartItem
	for _, it := range req.Items {
		if o, ok := offers[it.OfferID]; ok && o.Active {
			attempt = append(attempt, it)
			total += o.PriceCents * it.Quantity
		}
	}
	if len(attempt) == 0 {
		rollback(tx)
		return Order{}, false, s.changed(ctx, conn, req.Items, now, nil)
	}

	// 3. The order row. Its total is computed from the DATABASE prices (never the client's).
	var orderID string
	err = tx.QueryRow(ctx, `
		INSERT INTO orders (user_id, status, total_cents, idempotency_key, reserved_until, created_at)
		VALUES ($1, 'pending', $2, $3::uuid, $4, $5)
		ON CONFLICT (user_id, idempotency_key) DO NOTHING
		RETURNING id::text`,
		userID, total, key, ReservedUntil(now), now).Scan(&orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		// A concurrent request with the same key committed first (our INSERT waited for it).
		id, found, err := orderIDByKey(ctx, tx, userID, key)
		if err != nil {
			return Order{}, false, err
		}
		if !found {
			return Order{}, false, errors.New("orders: idempotency conflict without an order")
		}
		o, err := loadOrder(ctx, tx, userID, id, now)
		return o, false, err
	}
	if err != nil {
		return Order{}, false, fmt.Errorf("orders: insert order: %w", err)
	}

	// 4. Items + keys, line by line.
	got := make(map[int64]int, len(attempt)) // offer id -> keys we managed to reserve
	until := ReservedUntil(now)
	for _, it := range attempt {
		o := offers[it.OfferID]
		var itemID int64
		err := tx.QueryRow(ctx, `
			INSERT INTO order_items (order_id, offer_id, quantity, unit_price_cents,
			                         product_slug, product_title, edition, platform_name, region_name, seller_name)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id`,
			orderID, o.ID, it.Quantity, o.PriceCents,
			o.ProductSlug, o.Title, o.Edition, o.PlatformName, o.RegionName, o.SellerName).Scan(&itemID)
		if err != nil {
			return Order{}, false, fmt.Errorf("orders: insert order item: %w", err)
		}
		n, err := reserveKeys(ctx, tx, o.ID, it.Quantity, now, until, itemID)
		if err != nil {
			return Order{}, false, err
		}
		got[o.ID] = n
	}

	// 5. Did every line work out exactly as the client expected? The same rule code (ReviewLine)
	// decides, fed with "what we really reserved" as the stock: reserving all we wanted proves
	// there is enough, reserving less shows the shortage.
	proxy := make([]Line, len(req.Items))
	capStock := make(map[int64]int)
	for i, it := range req.Items {
		o, ok := offers[it.OfferID]
		var offer *OfferInfo
		if ok {
			offer = &o
		}
		proxy[i] = ReviewLine(it, offer, got[it.OfferID])
		if ok && got[it.OfferID] < it.Quantity {
			capStock[it.OfferID] = got[it.OfferID]
		}
	}
	if HasChanges(proxy) {
		rollback(tx) // the order, its items and every reservation disappear
		return Order{}, false, s.changed(ctx, conn, req.Items, now, capStock)
	}

	o, err := loadOrder(ctx, tx, userID, orderID, now)
	if err != nil {
		return Order{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Order{}, false, fmt.Errorf("orders: commit: %w", err)
	}
	return o, true, nil
}

// changed builds the 409 answer: every line as it looks now, read after the rollback.
func (s *Store) changed(ctx context.Context, q querier, items []CartItem, now time.Time, capStock map[int64]int) error {
	lines, err := s.reviewLines(ctx, q, items, now, capStock)
	if err != nil {
		return err
	}
	return &ChangedError{Lines: lines}
}

// reserveKeys takes up to `want` sellable keys of one offer for an order item and returns how many
// it got. THE core of "never sell a key twice":
//
//   - FOR UPDATE locks the picked rows until our transaction ends.
//   - SKIP LOCKED: rows another checkout has locked are not waited for and not picked - we take the
//     next free keys instead. Two buyers can therefore never get the same key, and they never queue
//     behind each other.
//   - After the lock Postgres re-checks the WHERE on the newest version of the row, so a key that
//     someone reserved and committed a moment ago is dropped.
//   - An EXPIRED reservation counts as free (lazy expiry): the key is simply overwritten with the
//     new reservation, including order_item_id - which is how the old owner loses it.
//
// A plain "SELECT a key, then UPDATE it" would let two transactions select the same key before
// either updates it.
func reserveKeys(ctx context.Context, tx pgx.Tx, offerID int64, want int, now, until time.Time, itemID int64) (int, error) {
	tag, err := tx.Exec(ctx, `
		WITH picked AS (
		    SELECT id FROM keys
		    WHERE offer_id = $1 AND `+sellableKey+`
		    ORDER BY id
		    LIMIT $3
		    FOR UPDATE SKIP LOCKED
		)
		UPDATE keys k
		SET status = 'reserved', reserved_until = $4, order_item_id = $5
		FROM picked
		WHERE k.id = picked.id`,
		offerID, now, want, until, itemID)
	if err != nil {
		return 0, fmt.Errorf("orders: reserve keys: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// orderIDByKey finds the order a user created with an idempotency key.
func orderIDByKey(ctx context.Context, q querier, userID int64, key string) (id string, found bool, err error) {
	err = q.QueryRow(ctx, `SELECT id::text FROM orders WHERE user_id = $1 AND idempotency_key = $2::uuid`,
		userID, key).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("orders: find order by key: %w", err)
	}
	return id, true, nil
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

// ListOrders returns the user's orders, newest first (at most 100).
// A pending order whose reservation ended is shown as expired (lazy expiry, R4).
func (s *Store) ListOrders(ctx context.Context, userID int64) ([]Summary, error) {
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()
	now := s.clock()

	rows, err := conn.Query(ctx, `
		SELECT o.id::text, o.status, o.total_cents, coalesce(sum(oi.quantity), 0)::integer,
		       o.created_at, o.reserved_until
		FROM orders o
		LEFT JOIN order_items oi ON oi.order_id = o.id
		WHERE o.user_id = $1
		GROUP BY o.id
		ORDER BY o.created_at DESC, o.id DESC
		LIMIT 100`, userID)
	if err != nil {
		return nil, fmt.Errorf("orders: list: %w", err)
	}
	defer rows.Close()
	out := []Summary{}
	for rows.Next() {
		var sm Summary
		if err := rows.Scan(&sm.ID, &sm.Status, &sm.TotalCents, &sm.ItemCount, &sm.CreatedAt, &sm.ReservedUntil); err != nil {
			return nil, fmt.Errorf("orders: list: %w", err)
		}
		sm.CreatedAt, sm.ReservedUntil = sm.CreatedAt.UTC(), sm.ReservedUntil.UTC()
		sm.Status = EffectiveStatus(sm.Status, sm.ReservedUntil, now)
		out = append(out, sm)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("orders: list: %w", err)
	}
	return out, nil
}

// GetOrder returns one order of this user and the server time used to judge its expiry (so the
// client can run its countdown against the SERVER's clock, not its own).
// Someone else's order, an unknown id and a malformed id are all ErrNotFound (R9).
func (s *Store) GetOrder(ctx context.Context, userID int64, id string) (Order, time.Time, error) {
	if !IsUUID(id) {
		return Order{}, time.Time{}, ErrNotFound
	}
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return Order{}, time.Time{}, err
	}
	defer conn.Release()
	now := s.clock()
	o, err := loadOrder(ctx, conn, userID, id, now)
	return o, now, err
}

// loadOrder reads an order with its items - and, only when it is PAID, the key codes (R7).
// `user_id = $2` is in the query itself: another user's order is simply "no row" (R9).
// The status is the effective one (lazy expiry).
func loadOrder(ctx context.Context, q querier, userID int64, id string, now time.Time) (Order, error) {
	var o Order
	var stored string
	err := q.QueryRow(ctx, `
		SELECT id::text, status, total_cents, created_at, reserved_until, paid_at
		FROM orders WHERE id = $1::uuid AND user_id = $2`, id, userID).
		Scan(&o.ID, &stored, &o.TotalCents, &o.CreatedAt, &o.ReservedUntil, &o.PaidAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Order{}, ErrNotFound
	}
	if err != nil {
		return Order{}, fmt.Errorf("orders: load order: %w", err)
	}
	o.CreatedAt, o.ReservedUntil = o.CreatedAt.UTC(), o.ReservedUntil.UTC()
	if o.PaidAt != nil {
		t := o.PaidAt.UTC()
		o.PaidAt = &t
	}
	o.Status = EffectiveStatus(stored, o.ReservedUntil, now)

	// Items (read fully before the next query: a connection runs one at a time).
	rows, err := q.Query(ctx, `
		SELECT id, offer_id, product_slug, product_title, edition, platform_name, region_name,
		       seller_name, unit_price_cents, quantity
		FROM order_items WHERE order_id = $1::uuid ORDER BY id`, o.ID)
	if err != nil {
		return Order{}, fmt.Errorf("orders: load items: %w", err)
	}
	var itemIDs []int64
	o.Items = []OrderItem{}
	for rows.Next() {
		var itemID int64
		var it OrderItem
		if err := rows.Scan(&itemID, &it.OfferID, &it.ProductSlug, &it.Title, &it.Edition, &it.PlatformName,
			&it.RegionName, &it.SellerName, &it.UnitPriceCents, &it.Quantity); err != nil {
			rows.Close()
			return Order{}, fmt.Errorf("orders: load items: %w", err)
		}
		itemIDs = append(itemIDs, itemID)
		o.Items = append(o.Items, it)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return Order{}, fmt.Errorf("orders: load items: %w", err)
	}

	// The codes: read ONLY for a paid order, and shown only through VisibleKeys.
	codes := map[int64][]string{}
	if o.Status == StatusPaid {
		krows, err := q.Query(ctx, `
			SELECT order_item_id, code FROM keys
			WHERE order_item_id = ANY($1) AND status = 'sold'
			ORDER BY id`, itemIDs)
		if err != nil {
			return Order{}, fmt.Errorf("orders: load keys: %w", err)
		}
		for krows.Next() {
			var itemID int64
			var code string
			if err := krows.Scan(&itemID, &code); err != nil {
				krows.Close()
				return Order{}, fmt.Errorf("orders: load keys: %w", err)
			}
			codes[itemID] = append(codes[itemID], code)
		}
		krows.Close()
		if err := krows.Err(); err != nil {
			return Order{}, fmt.Errorf("orders: load keys: %w", err)
		}
	}
	for i := range o.Items {
		o.Items[i].Keys = VisibleKeys(o.Status, codes[itemIDs[i]])
	}
	return o, nil
}

// ---------------------------------------------------------------------------
// Pay and cancel
// ---------------------------------------------------------------------------

// lockOrder locks one order row of this user (FOR UPDATE) and returns its stored state. Two
// requests on the same order (a double click) queue here: the second one runs after the first has
// committed and sees its result. Not yours / unknown -> ErrNotFound (R9).
func lockOrder(ctx context.Context, tx pgx.Tx, userID int64, id string) (status string, reservedUntil time.Time, total int, err error) {
	err = tx.QueryRow(ctx, `
		SELECT status, reserved_until, total_cents
		FROM orders WHERE id = $1::uuid AND user_id = $2
		FOR UPDATE`, id, userID).Scan(&status, &reservedUntil, &total)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", time.Time{}, 0, ErrNotFound
	}
	if err != nil {
		return "", time.Time{}, 0, fmt.Errorf("orders: lock order: %w", err)
	}
	return status, reservedUntil.UTC(), total, nil
}

// PayOrder runs the simulated payment of a pending order (rule R6), in one transaction with the
// order row locked:
//
//	paid already            -> return it unchanged (no second payment)
//	expired / cancelled     -> ErrReservationExpired / ErrNotPayable
//	pending but too late    -> mark it expired, release its keys, ErrReservationExpired
//	decline                 -> a "declined" payment row, the order stays pending, ErrPaymentDeclined
//	success                 -> all its keys must still be ours: sell them, order paid, "succeeded" row
//
// The two errors that change data (too late, declined) are returned AFTER the transaction committed.
func (s *Store) PayOrder(ctx context.Context, userID int64, id, outcome string) (Order, error) {
	if !IsUUID(id) {
		return Order{}, ErrNotFound
	}
	if !ValidOutcome(outcome) {
		return Order{}, ValidationError(`outcome must be "success" or "decline"`)
	}
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return Order{}, err
	}
	defer conn.Release()
	tx, err := conn.Begin(ctx)
	if err != nil {
		return Order{}, fmt.Errorf("orders: begin: %w", err)
	}
	defer rollback(tx)
	now := s.clock()

	status, reservedUntil, total, err := lockOrder(ctx, tx, userID, id)
	if err != nil {
		return Order{}, err
	}
	switch DecidePay(status, reservedUntil, now) {
	case PayAlreadyPaid:
		return loadOrder(ctx, tx, userID, id, now)
	case PayExpired:
		return Order{}, ErrReservationExpired
	case PayRefused:
		return Order{}, ErrNotPayable
	case PayExpireNow:
		return Order{}, commitThen(ctx, tx, ErrReservationExpired, expireOrder(ctx, tx, id))
	}

	// PayRun: the order is pending and its reservation is still running.
	if outcome == OutcomeDecline {
		if err := insertPayment(ctx, tx, id, "declined", total, now); err != nil {
			return Order{}, err
		}
		return Order{}, commitThen(ctx, tx, ErrPaymentDeclined, nil)
	}

	// success: lock every key still reserved for this order and not expired. If fewer than the
	// order needs are still ours (cannot happen while the order lock and the time check above hold,
	// but a key could have been taken over after a clock difference between two servers), nothing
	// is sold: the order expires instead. Someone else's key is NEVER sold.
	keyIDs, err := ownKeys(ctx, tx, id, now)
	if err != nil {
		return Order{}, err
	}
	var want int
	if err := tx.QueryRow(ctx, `SELECT coalesce(sum(quantity), 0)::integer FROM order_items WHERE order_id = $1::uuid`, id).Scan(&want); err != nil {
		return Order{}, fmt.Errorf("orders: count wanted keys: %w", err)
	}
	if len(keyIDs) != want {
		return Order{}, commitThen(ctx, tx, ErrReservationExpired, expireOrder(ctx, tx, id))
	}
	if _, err := tx.Exec(ctx, `
		UPDATE keys SET status = 'sold', sold_at = $2, reserved_until = NULL
		WHERE id = ANY($1)`, keyIDs, now); err != nil {
		return Order{}, fmt.Errorf("orders: sell keys: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'paid', paid_at = $2 WHERE id = $1::uuid`, id, now); err != nil {
		return Order{}, fmt.Errorf("orders: mark paid: %w", err)
	}
	if err := insertPayment(ctx, tx, id, "succeeded", total, now); err != nil {
		return Order{}, err
	}
	o, err := loadOrder(ctx, tx, userID, id, now)
	if err != nil {
		return Order{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Order{}, fmt.Errorf("orders: commit: %w", err)
	}
	return o, nil
}

// commitThen commits the transaction and returns `result` - the error the caller wants to report
// after the changes were saved. A failed earlier step (stepErr) or a failed commit wins.
func commitThen(ctx context.Context, tx pgx.Tx, result error, stepErr error) error {
	if stepErr != nil {
		return stepErr
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("orders: commit: %w", err)
	}
	return result
}

// ownKeys locks and returns the ids of the keys that are reserved for this order AND whose
// reservation has not ended. The match is on order_item_id: a key that another checkout took over
// carries THEIR order item and is not returned.
func ownKeys(ctx context.Context, tx pgx.Tx, orderID string, now time.Time) ([]int64, error) {
	rows, err := tx.Query(ctx, `
		SELECT k.id
		FROM keys k
		JOIN order_items oi ON oi.id = k.order_item_id
		WHERE oi.order_id = $1::uuid AND k.status = 'reserved' AND k.reserved_until > $2
		ORDER BY k.id
		FOR UPDATE OF k`, orderID, now)
	if err != nil {
		return nil, fmt.Errorf("orders: lock own keys: %w", err)
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("orders: lock own keys: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("orders: lock own keys: %w", err)
	}
	return ids, nil
}

func insertPayment(ctx context.Context, tx pgx.Tx, orderID, outcome string, amount int, now time.Time) error {
	if _, err := tx.Exec(ctx, `
		INSERT INTO payments (order_id, outcome, amount_cents, created_at)
		VALUES ($1::uuid, $2, $3, $4)`, orderID, outcome, amount, now); err != nil {
		return fmt.Errorf("orders: insert payment: %w", err)
	}
	return nil
}

// expireOrder marks an order expired and frees the keys it still holds.
func expireOrder(ctx context.Context, tx pgx.Tx, orderID string) error {
	if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'expired' WHERE id = $1::uuid`, orderID); err != nil {
		return fmt.Errorf("orders: mark expired: %w", err)
	}
	return releaseKeys(ctx, tx, orderID)
}

// releaseKeys makes the keys reserved for an order available again. The match is on order_item_id
// AND status = 'reserved': a key that was already sold stays sold, and a key that another checkout
// took over (its order_item_id changed) is not touched.
func releaseKeys(ctx context.Context, tx pgx.Tx, orderID string) error {
	if _, err := tx.Exec(ctx, `
		UPDATE keys
		SET status = 'available', reserved_until = NULL, order_item_id = NULL
		WHERE status = 'reserved'
		  AND order_item_id IN (SELECT id FROM order_items WHERE order_id = $1::uuid)`, orderID); err != nil {
		return fmt.Errorf("orders: release keys: %w", err)
	}
	return nil
}

// CancelOrder cancels a pending order and releases its keys (rule R6). An order that is not
// pending - or whose time has run out, which then becomes expired - is ErrNotPending.
func (s *Store) CancelOrder(ctx context.Context, userID int64, id string) (Order, error) {
	if !IsUUID(id) {
		return Order{}, ErrNotFound
	}
	conn, err := s.src.Acquire(ctx)
	if err != nil {
		return Order{}, err
	}
	defer conn.Release()
	tx, err := conn.Begin(ctx)
	if err != nil {
		return Order{}, fmt.Errorf("orders: begin: %w", err)
	}
	defer rollback(tx)
	now := s.clock()

	status, reservedUntil, _, err := lockOrder(ctx, tx, userID, id)
	if err != nil {
		return Order{}, err
	}
	switch DecideCancel(status, reservedUntil, now) {
	case CancelRefused:
		return Order{}, ErrNotPending
	case CancelExpireNow:
		return Order{}, commitThen(ctx, tx, ErrNotPending, expireOrder(ctx, tx, id))
	}
	if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'cancelled' WHERE id = $1::uuid`, id); err != nil {
		return Order{}, fmt.Errorf("orders: mark cancelled: %w", err)
	}
	if err := releaseKeys(ctx, tx, id); err != nil {
		return Order{}, err
	}
	o, err := loadOrder(ctx, tx, userID, id, now)
	if err != nil {
		return Order{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Order{}, fmt.Errorf("orders: commit: %w", err)
	}
	return o, nil
}
