package orders_test

// Integration tests: the REAL orders.Store on a real Postgres (pkg/testdb, schema only).
// Skipped when TEST_DATABASE_URL is empty; CI's `migrations` job runs them (REQUIRE_TEST_DB=1).
//
// Every test builds its OWN catalog rows (random slugs, its own offer and keys), so the tests do not
// depend on the seed and do not disturb each other. The clock is a fake one: "15 minutes later" is
// one call, no sleeping.

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dovydas472/ENEBA-homework/pkg/orders"
	"github.com/dovydas472/ENEBA-homework/pkg/seedgen"
	"github.com/dovydas472/ENEBA-homework/pkg/testdb"
)

// testClock is a clock the test can move forward. Mutex: the concurrent tests read it from many goroutines.
type testClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *testClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *testClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

type fixture struct {
	pool  *pgxpool.Pool
	store *orders.Store
	clock *testClock
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	pool := testdb.Migrated(t)
	clock := &testClock{t: time.Now().UTC()}
	return &fixture{pool: pool, store: orders.NewStoreFromPool(pool).WithClock(clock.Now), clock: clock}
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x", b)
}

// newUUID makes a random UUID-shaped string for idempotency keys.
func newUUID() string {
	h := randHex(16)
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}

// newUser inserts a (demo-style) user and returns its id.
func (f *fixture) newUser(t *testing.T) int64 {
	t.Helper()
	var id int64
	err := f.pool.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, is_demo) VALUES ($1, NULL, true) RETURNING id`,
		"t-"+randHex(6)+"@demo.invalid").Scan(&id)
	if err != nil {
		t.Fatalf("insert user: %v", err)
	}
	return id
}

type offer struct {
	id    int64
	price int
	codes []string // the key codes, in insertion order
}

// newOffer builds a whole product (own platform, region, game, seller) with one offer and n keys.
func (f *fixture) newOffer(t *testing.T, price, n int) offer {
	t.Helper()
	ctx := context.Background()
	sfx := randHex(6)
	var platformID, regionID, sellerID, gameID, productID int64
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatalf("fixture insert: %v", err)
		}
	}
	must(f.pool.QueryRow(ctx, `INSERT INTO platforms (slug, name) VALUES ($1, 'Test PC') RETURNING id`, "t-pl-"+sfx).Scan(&platformID))
	must(f.pool.QueryRow(ctx, `INSERT INTO regions (slug, name) VALUES ($1, 'Test Region') RETURNING id`, "t-rg-"+sfx).Scan(&regionID))
	must(f.pool.QueryRow(ctx, `INSERT INTO sellers (slug, name) VALUES ($1, 'Test Seller') RETURNING id`, "t-sl-"+sfx).Scan(&sellerID))
	must(f.pool.QueryRow(ctx, `INSERT INTO games (slug, title) VALUES ($1, 'Test Game') RETURNING id`, "t-gm-"+sfx).Scan(&gameID))
	must(f.pool.QueryRow(ctx, `INSERT INTO products (game_id, platform_id, region_id, slug) VALUES ($1, $2, $3, $4) RETURNING id`,
		gameID, platformID, regionID, "t-pr-"+sfx).Scan(&productID))
	o := offer{price: price}
	must(f.pool.QueryRow(ctx, `INSERT INTO offers (product_id, seller_id, price_cents) VALUES ($1, $2, $3) RETURNING id`,
		productID, sellerID, price).Scan(&o.id))
	for i := 0; i < n; i++ {
		code := fmt.Sprintf("DEMO-%s-%04d", sfx, i)
		_, err := f.pool.Exec(ctx, `INSERT INTO keys (offer_id, code) VALUES ($1, $2)`, o.id, code)
		must(err)
		o.codes = append(o.codes, code)
	}
	return o
}

// create asks for qty keys of the offer at the offer's current price, with a fresh idempotency key.
func (f *fixture) create(userID int64, o offer, qty int) (orders.Order, bool, error) {
	return f.store.CreateOrder(context.Background(), userID, orders.CreateRequest{
		IdempotencyKey: newUUID(),
		Items:          []orders.CartItem{{OfferID: o.id, Quantity: qty, ExpectedPriceCents: o.price}},
	})
}

func (f *fixture) mustCreate(t *testing.T, userID int64, o offer, qty int) orders.Order {
	t.Helper()
	order, created, err := f.create(userID, o, qty)
	if err != nil || !created {
		t.Fatalf("create order: created=%v err=%v", created, err)
	}
	return order
}

func (f *fixture) pay(userID int64, id, outcome string) (orders.Order, error) {
	return f.store.PayOrder(context.Background(), userID, id, outcome)
}

// keyCounts returns how many keys of the offer have each status.
func (f *fixture) keyCounts(t *testing.T, offerID int64) map[string]int {
	t.Helper()
	rows, err := f.pool.Query(context.Background(), `SELECT status, count(*) FROM keys WHERE offer_id = $1 GROUP BY status`, offerID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var s string
		var n int
		if err := rows.Scan(&s, &n); err != nil {
			t.Fatal(err)
		}
		out[s] = n
	}
	return out
}

func (f *fixture) count(t *testing.T, sql string, args ...any) int {
	t.Helper()
	var n int
	if err := f.pool.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
	return n
}

func (f *fixture) payments(t *testing.T, orderID, outcome string) int {
	return f.count(t, `SELECT count(*) FROM payments WHERE order_id = $1::uuid AND outcome = $2`, orderID, outcome)
}

func changesOf(t *testing.T, err error) []orders.Line {
	t.Helper()
	var ce *orders.ChangedError
	if !errors.As(err, &ce) {
		t.Fatalf("error = %v, want *orders.ChangedError", err)
	}
	return ce.Lines
}

func TestCreatePay_happyPath(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	o := f.newOffer(t, 1500, 3)

	order := f.mustCreate(t, buyer, o, 2)
	if order.Status != orders.StatusPending || order.TotalCents != 3000 || len(order.Items) != 1 {
		t.Fatalf("created order = %+v", order)
	}
	it := order.Items[0]
	if it.Quantity != 2 || it.UnitPriceCents != 1500 || it.Title != "Test Game" || it.SellerName != "Test Seller" ||
		it.PlatformName != "Test PC" || it.RegionName != "Test Region" || it.Edition != "Standard" {
		t.Errorf("item snapshot = %+v", it)
	}
	if want := order.CreatedAt.Add(orders.ReservationTTL); !order.ReservedUntil.Equal(want) {
		t.Errorf("reservedUntil = %v, want createdAt + 15 minutes = %v", order.ReservedUntil, want)
	}
	if it.Keys == nil || len(it.Keys) != 0 {
		t.Errorf("a pending order must show keys [] (never null, never codes), got %#v", it.Keys)
	}
	if c := f.keyCounts(t, o.id); c["reserved"] != 2 || c["available"] != 1 {
		t.Errorf("key states after create = %v, want 2 reserved + 1 available", c)
	}

	paid, err := f.pay(buyer, order.ID, orders.OutcomeSuccess)
	if err != nil {
		t.Fatalf("pay: %v", err)
	}
	if paid.Status != orders.StatusPaid || paid.PaidAt == nil {
		t.Fatalf("paid order = %+v", paid)
	}
	if got := paid.Items[0].Keys; len(got) != 2 || !slices.Contains(o.codes, got[0]) || !slices.Contains(o.codes, got[1]) || got[0] == got[1] {
		t.Errorf("keys of the paid order = %v, want 2 different codes of this offer", got)
	}
	if c := f.keyCounts(t, o.id); c["sold"] != 2 || c["available"] != 1 || c["reserved"] != 0 {
		t.Errorf("key states after pay = %v, want 2 sold + 1 available", c)
	}
	if n := f.count(t, `SELECT count(*) FROM keys WHERE offer_id = $1 AND status = 'sold' AND sold_at IS NOT NULL AND reserved_until IS NULL`, o.id); n != 2 {
		t.Errorf("sold keys with sold_at set = %d, want 2", n)
	}
	if f.payments(t, order.ID, "succeeded") != 1 {
		t.Error("want exactly one succeeded payment")
	}

	// Reading it back shows the same keys; the list shows it as paid with 2 items.
	got, serverTime, err := f.store.GetOrder(context.Background(), buyer, order.ID)
	if err != nil || got.Status != orders.StatusPaid || len(got.Items[0].Keys) != 2 || serverTime.IsZero() {
		t.Fatalf("GetOrder = %+v, %v, %v", got, serverTime, err)
	}
	list, err := f.store.ListOrders(context.Background(), buyer)
	if err != nil || len(list) != 1 || list[0].ID != order.ID || list[0].Status != orders.StatusPaid || list[0].ItemCount != 2 {
		t.Fatalf("ListOrders = %+v, %v", list, err)
	}
}

func TestPay_declineThenSuccess(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	o := f.newOffer(t, 1000, 1)
	order := f.mustCreate(t, buyer, o, 1)

	if _, err := f.pay(buyer, order.ID, orders.OutcomeDecline); !errors.Is(err, orders.ErrPaymentDeclined) {
		t.Fatalf("decline: err = %v, want ErrPaymentDeclined", err)
	}
	got, _, _ := f.store.GetOrder(context.Background(), buyer, order.ID)
	if got.Status != orders.StatusPending || len(got.Items[0].Keys) != 0 {
		t.Errorf("after a decline the order must stay pending without keys: %+v", got)
	}
	if f.payments(t, order.ID, "declined") != 1 || f.payments(t, order.ID, "succeeded") != 0 {
		t.Error("want one declined payment and no succeeded one")
	}
	if c := f.keyCounts(t, o.id); c["reserved"] != 1 {
		t.Errorf("the key must stay reserved after a decline: %v", c)
	}

	paid, err := f.pay(buyer, order.ID, orders.OutcomeSuccess)
	if err != nil || paid.Status != orders.StatusPaid || len(paid.Items[0].Keys) != 1 {
		t.Fatalf("pay after decline: %+v, %v", paid, err)
	}
	if f.payments(t, order.ID, "declined") != 1 || f.payments(t, order.ID, "succeeded") != 1 {
		t.Error("want the declined attempt kept and one succeeded payment")
	}
}

func TestPay_expiredReservationIs409AndReleasesTheKeys(t *testing.T) {
	f := newFixture(t)
	a, b := f.newUser(t), f.newUser(t)
	o := f.newOffer(t, 1000, 1) // ONE key
	order := f.mustCreate(t, a, o, 1)

	// While the reservation runs, nobody else can buy the key.
	if _, _, err := f.create(b, o, 1); err == nil {
		t.Fatal("the reserved key was sold to a second buyer")
	}

	f.clock.Advance(orders.ReservationTTL + time.Minute)

	// Lazy expiry: reading shows "expired" without anything having run in the background.
	got, _, _ := f.store.GetOrder(context.Background(), a, order.ID)
	if got.Status != orders.StatusExpired {
		t.Errorf("read after 16 minutes: status %q, want expired", got.Status)
	}
	if _, err := f.pay(a, order.ID, orders.OutcomeSuccess); !errors.Is(err, orders.ErrReservationExpired) {
		t.Fatalf("pay after expiry: err = %v, want ErrReservationExpired", err)
	}
	if n := f.count(t, `SELECT count(*) FROM orders WHERE id = $1::uuid AND status = 'expired'`, order.ID); n != 1 {
		t.Error("paying too late must persist the status 'expired'")
	}
	if c := f.keyCounts(t, o.id); c["available"] != 1 || c["reserved"] != 0 {
		t.Errorf("key states after the expiry = %v, want the key available again", c)
	}
	if f.payments(t, order.ID, "succeeded") != 0 {
		t.Error("an expired order must not get a payment")
	}
	// Second attempt on the now-stored expired order: still "Reservation expired".
	if _, err := f.pay(a, order.ID, orders.OutcomeSuccess); !errors.Is(err, orders.ErrReservationExpired) {
		t.Errorf("second pay: err = %v, want ErrReservationExpired", err)
	}

	// The freed key can be bought by someone else.
	if bOrder := f.mustCreate(t, b, o, 1); bOrder.Status != orders.StatusPending {
		t.Errorf("the other buyer's order = %+v", bOrder)
	}
}

// An expired reservation is taken over by the next buyer WITHOUT any release step. The first
// buyer then pays too late: their order expires, and the key that is now someone else's is untouched.
func TestExpiredReservation_isTakenOverAndTheOldOwnerCannotSellIt(t *testing.T) {
	f := newFixture(t)
	a, b := f.newUser(t), f.newUser(t)
	o := f.newOffer(t, 1000, 1)
	aOrder := f.mustCreate(t, a, o, 1)

	f.clock.Advance(orders.ReservationTTL + time.Minute)
	bOrder := f.mustCreate(t, b, o, 1) // takes the key over: the old reservation had ended

	if _, err := f.pay(a, aOrder.ID, orders.OutcomeSuccess); !errors.Is(err, orders.ErrReservationExpired) {
		t.Fatalf("old owner pays: err = %v, want ErrReservationExpired", err)
	}
	if c := f.keyCounts(t, o.id); c["reserved"] != 1 {
		t.Fatalf("the old owner's expiry must not release the key B now holds: %v", c)
	}
	paid, err := f.pay(b, bOrder.ID, orders.OutcomeSuccess)
	if err != nil || len(paid.Items[0].Keys) != 1 || paid.Items[0].Keys[0] != o.codes[0] {
		t.Fatalf("B pays: %+v, %v", paid, err)
	}
	// A sees no key, ever.
	gotA, _, _ := f.store.GetOrder(context.Background(), a, aOrder.ID)
	if gotA.Status != orders.StatusExpired || len(gotA.Items[0].Keys) != 0 {
		t.Errorf("A's order = %+v, want expired without keys", gotA)
	}
}

func TestCancel_releasesTheKeys(t *testing.T) {
	f := newFixture(t)
	buyer, other := f.newUser(t), f.newUser(t)
	o := f.newOffer(t, 1000, 2)
	order := f.mustCreate(t, buyer, o, 2)

	cancelled, err := f.store.CancelOrder(context.Background(), buyer, order.ID)
	if err != nil || cancelled.Status != orders.StatusCancelled {
		t.Fatalf("cancel: %+v, %v", cancelled, err)
	}
	if c := f.keyCounts(t, o.id); c["available"] != 2 || c["reserved"] != 0 {
		t.Errorf("key states after cancel = %v, want both available", c)
	}
	if n := f.count(t, `SELECT count(*) FROM keys WHERE offer_id = $1 AND order_item_id IS NOT NULL`, o.id); n != 0 {
		t.Errorf("%d keys still point at the cancelled order's items", n)
	}
	if _, err := f.store.CancelOrder(context.Background(), buyer, order.ID); !errors.Is(err, orders.ErrNotPending) {
		t.Errorf("cancel twice: err = %v, want ErrNotPending", err)
	}
	if _, err := f.pay(buyer, order.ID, orders.OutcomeSuccess); !errors.Is(err, orders.ErrNotPayable) {
		t.Errorf("pay a cancelled order: err = %v, want ErrNotPayable", err)
	}
	// And the keys are buyable by someone else.
	f.mustCreate(t, other, o, 2)
}

func TestCancel_paidOrderIsRefused(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	o := f.newOffer(t, 1000, 1)
	order := f.mustCreate(t, buyer, o, 1)
	if _, err := f.pay(buyer, order.ID, orders.OutcomeSuccess); err != nil {
		t.Fatal(err)
	}
	if _, err := f.store.CancelOrder(context.Background(), buyer, order.ID); !errors.Is(err, orders.ErrNotPending) {
		t.Fatalf("cancel a paid order: err = %v, want ErrNotPending", err)
	}
	if c := f.keyCounts(t, o.id); c["sold"] != 1 {
		t.Errorf("a refused cancel must not touch sold keys: %v", c)
	}
}

func TestCreate_sameIdempotencyKeyIsTheSameOrder(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	o := f.newOffer(t, 1000, 6)
	req := orders.CreateRequest{IdempotencyKey: newUUID(), Items: []orders.CartItem{{OfferID: o.id, Quantity: 2, ExpectedPriceCents: 1000}}}

	first, created, err := f.store.CreateOrder(context.Background(), buyer, req)
	if err != nil || !created {
		t.Fatalf("first: created=%v err=%v", created, err)
	}
	second, created, err := f.store.CreateOrder(context.Background(), buyer, req)
	if err != nil || created || second.ID != first.ID {
		t.Fatalf("second: id %q (first %q), created=%v, err=%v; want the same order, created=false", second.ID, first.ID, created, err)
	}
	if n := f.count(t, `SELECT count(*) FROM orders WHERE user_id = $1`, buyer); n != 1 {
		t.Errorf("%d orders, want 1", n)
	}
	if c := f.keyCounts(t, o.id); c["reserved"] != 2 {
		t.Errorf("key states = %v, want exactly 2 reserved (no second reservation)", c)
	}

	// A retry is answered from the stored order EVEN IF the cart would not be valid any more
	// (here: 5 of the 6 keys are taken by now, the retry still gets its order).
	other := f.newUser(t)
	f.mustCreate(t, other, o, 3)
	again, created, err := f.store.CreateOrder(context.Background(), buyer, req)
	if err != nil || created || again.ID != first.ID {
		t.Errorf("retry after the stock ran out: %+v created=%v err=%v", again.ID, created, err)
	}

	// The key belongs to ONE user: the same key from another user is a separate order.
	// (1 key is left: 6 - 2 - 3, so this buyer asks for 1.)
	third, created, err := f.store.CreateOrder(context.Background(), f.newUser(t), orders.CreateRequest{
		IdempotencyKey: req.IdempotencyKey,
		Items:          []orders.CartItem{{OfferID: o.id, Quantity: 1, ExpectedPriceCents: 1000}},
	})
	if err != nil || !created || third.ID == first.ID {
		t.Errorf("same key, other user: id %q (first %q), created=%v, err=%v; want a new order", third.ID, first.ID, created, err)
	}
}

func TestCreate_badRequestsAreValidationErrors(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	o := f.newOffer(t, 1000, 1)
	ctx := context.Background()
	good := []orders.CartItem{{OfferID: o.id, Quantity: 1, ExpectedPriceCents: 1000}}

	for name, req := range map[string]orders.CreateRequest{
		"no key":        {IdempotencyKey: "", Items: good},
		"key not UUID":  {IdempotencyKey: "abc", Items: good},
		"no items":      {IdempotencyKey: newUUID()},
		"quantity zero": {IdempotencyKey: newUUID(), Items: []orders.CartItem{{OfferID: o.id, Quantity: 0, ExpectedPriceCents: 1000}}},
	} {
		_, _, err := f.store.CreateOrder(ctx, buyer, req)
		var invalid orders.ValidationError
		if !errors.As(err, &invalid) {
			t.Errorf("%s: err = %v, want a validation error", name, err)
		}
	}
	if n := f.count(t, `SELECT count(*) FROM orders WHERE user_id = $1`, buyer); n != 0 {
		t.Errorf("%d orders created from bad requests", n)
	}
}

// The same request fired many times at once (a nervous double click, a retrying proxy):
// exactly one order, one reservation, everyone gets that order.
func TestCreate_concurrentDuplicatesMakeOneOrder(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	o := f.newOffer(t, 1000, 1) // ONE key: a duplicate must not be refused for "no stock"
	req := orders.CreateRequest{IdempotencyKey: newUUID(), Items: []orders.CartItem{{OfferID: o.id, Quantity: 1, ExpectedPriceCents: 1000}}}

	const n = 6
	type result struct {
		order   orders.Order
		created bool
		err     error
	}
	results := make(chan result, n)
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		go func() {
			<-start
			order, created, err := f.store.CreateOrder(context.Background(), buyer, req)
			results <- result{order, created, err}
		}()
	}
	close(start)

	createdCount := 0
	ids := map[string]bool{}
	for i := 0; i < n; i++ {
		r := <-results
		if r.err != nil {
			t.Fatalf("a duplicate request failed: %v", r.err)
		}
		if r.created {
			createdCount++
		}
		ids[r.order.ID] = true
	}
	if createdCount != 1 || len(ids) != 1 {
		t.Errorf("created=%d distinct orders=%d, want 1 and 1", createdCount, len(ids))
	}
	if c := f.keyCounts(t, o.id); c["reserved"] != 1 {
		t.Errorf("key states = %v, want exactly 1 reserved", c)
	}
}

func TestPay_twiceChargesOnce(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	o := f.newOffer(t, 1000, 2)
	order := f.mustCreate(t, buyer, o, 2)

	first, err := f.pay(buyer, order.ID, orders.OutcomeSuccess)
	if err != nil {
		t.Fatal(err)
	}
	second, err := f.pay(buyer, order.ID, orders.OutcomeSuccess)
	if err != nil || second.Status != orders.StatusPaid || !second.PaidAt.Equal(*first.PaidAt) || !slices.Equal(second.Items[0].Keys, first.Items[0].Keys) {
		t.Fatalf("second pay: %+v, %v; want the paid order unchanged", second, err)
	}
	// Paying an already paid order with "decline" must not touch it either.
	third, err := f.pay(buyer, order.ID, orders.OutcomeDecline)
	if err != nil || third.Status != orders.StatusPaid {
		t.Fatalf("decline on a paid order: %+v, %v", third, err)
	}
	if f.payments(t, order.ID, "succeeded") != 1 || f.payments(t, order.ID, "declined") != 0 {
		t.Error("want one succeeded payment and nothing else")
	}
}

func TestPay_concurrentDoubleClickChargesOnce(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	o := f.newOffer(t, 1000, 2)
	order := f.mustCreate(t, buyer, o, 2)

	const n = 5
	errs := make(chan error, n)
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		go func() {
			<-start
			_, err := f.pay(buyer, order.ID, orders.OutcomeSuccess)
			errs <- err
		}()
	}
	close(start)
	for i := 0; i < n; i++ {
		if err := <-errs; err != nil {
			t.Errorf("a concurrent pay failed: %v", err)
		}
	}
	if f.payments(t, order.ID, "succeeded") != 1 {
		t.Errorf("%d succeeded payments, want exactly 1", f.payments(t, order.ID, "succeeded"))
	}
	if c := f.keyCounts(t, o.id); c["sold"] != 2 {
		t.Errorf("key states = %v, want 2 sold", c)
	}
}

func TestCreate_priceChangedIs409AndNothingIsCreated(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	o := f.newOffer(t, 1000, 2)
	// The seller raises the price after the buyer saw 1000.
	if _, err := f.pool.Exec(context.Background(), `UPDATE offers SET price_cents = 1200 WHERE id = $1`, o.id); err != nil {
		t.Fatal(err)
	}

	_, _, err := f.create(buyer, o, 1) // still expects 1000
	lines := changesOf(t, err)
	if len(lines) != 1 || lines[0].UnitPriceCents != 1200 || !slices.Equal(lines[0].Changes, []string{orders.ChangePriceChanged}) {
		t.Fatalf("lines = %+v, want one line with price_changed and the new price 1200", lines)
	}
	if n := f.count(t, `SELECT count(*) FROM orders WHERE user_id = $1`, buyer); n != 0 {
		t.Errorf("%d orders were created, want none", n)
	}
	if c := f.keyCounts(t, o.id); c["available"] != 2 {
		t.Errorf("key states = %v, want both still available", c)
	}
}

func TestCreate_unavailableAndReducedLines(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	plenty := f.newOffer(t, 500, 3)
	scarce := f.newOffer(t, 700, 2)
	paused := f.newOffer(t, 900, 2)
	if _, err := f.pool.Exec(context.Background(), `UPDATE offers SET is_active = false WHERE id = $1`, paused.id); err != nil {
		t.Fatal(err)
	}

	_, _, err := f.store.CreateOrder(context.Background(), buyer, orders.CreateRequest{
		IdempotencyKey: newUUID(),
		Items: []orders.CartItem{
			{OfferID: plenty.id, Quantity: 1, ExpectedPriceCents: 500},
			{OfferID: scarce.id, Quantity: 4, ExpectedPriceCents: 700},
			{OfferID: paused.id, Quantity: 1, ExpectedPriceCents: 900},
			{OfferID: 999999999, Quantity: 1, ExpectedPriceCents: 100}, // does not exist
		},
	})
	lines := changesOf(t, err)
	if len(lines) != 4 {
		t.Fatalf("%d lines, want all 4", len(lines))
	}
	if len(lines[0].Changes) != 0 || lines[0].Quantity != 1 {
		t.Errorf("the healthy line must come back unchanged: %+v", lines[0])
	}
	if !slices.Equal(lines[1].Changes, []string{orders.ChangeQuantityReduced}) || lines[1].Quantity != 2 || lines[1].MaxQuantity != 2 {
		t.Errorf("the scarce line: %+v, want quantity_reduced to 2", lines[1])
	}
	if !slices.Equal(lines[2].Changes, []string{orders.ChangeUnavailable}) || lines[2].Available {
		t.Errorf("the paused line: %+v, want unavailable", lines[2])
	}
	if !slices.Equal(lines[3].Changes, []string{orders.ChangeUnavailable}) || lines[3].OfferID != 999999999 {
		t.Errorf("the unknown offer: %+v, want unavailable", lines[3])
	}
	// Nothing at all was reserved, not even for the healthy lines.
	for _, off := range []offer{plenty, scarce, paused} {
		if c := f.keyCounts(t, off.id); c["reserved"] != 0 {
			t.Errorf("offer %d: %v, want nothing reserved", off.id, c)
		}
	}
	if n := f.count(t, `SELECT count(*) FROM orders WHERE user_id = $1`, buyer); n != 0 {
		t.Errorf("%d orders, want none", n)
	}
}

func TestQuote_readsOnly(t *testing.T) {
	f := newFixture(t)
	o := f.newOffer(t, 800, 2)
	q, err := f.store.Quote(context.Background(), []orders.CartItem{{OfferID: o.id, Quantity: 5, ExpectedPriceCents: 800}})
	if err != nil {
		t.Fatal(err)
	}
	if len(q.Lines) != 1 || q.Lines[0].Quantity != 2 || q.Lines[0].Stock != 2 || q.Lines[0].MaxQuantity != 2 ||
		!slices.Equal(q.Lines[0].Changes, []string{orders.ChangeQuantityReduced}) || q.TotalCents != 1600 {
		t.Errorf("quote = %+v", q)
	}
	if c := f.keyCounts(t, o.id); c["available"] != 2 {
		t.Errorf("a quote must reserve nothing: %v", c)
	}
}

func TestOrders_areInvisibleToOtherUsers(t *testing.T) {
	f := newFixture(t)
	owner, stranger := f.newUser(t), f.newUser(t)
	o := f.newOffer(t, 1000, 2)
	order := f.mustCreate(t, owner, o, 1)
	ctx := context.Background()

	if _, _, err := f.store.GetOrder(ctx, stranger, order.ID); !errors.Is(err, orders.ErrNotFound) {
		t.Errorf("get: %v, want ErrNotFound", err)
	}
	if _, err := f.pay(stranger, order.ID, orders.OutcomeSuccess); !errors.Is(err, orders.ErrNotFound) {
		t.Errorf("pay: %v, want ErrNotFound", err)
	}
	if _, err := f.store.CancelOrder(ctx, stranger, order.ID); !errors.Is(err, orders.ErrNotFound) {
		t.Errorf("cancel: %v, want ErrNotFound", err)
	}
	// An unknown id and a malformed id look exactly the same.
	for _, id := range []string{newUUID(), "not-a-uuid", "1; DROP TABLE orders"} {
		if _, _, err := f.store.GetOrder(ctx, owner, id); !errors.Is(err, orders.ErrNotFound) {
			t.Errorf("get %q: %v, want ErrNotFound", id, err)
		}
	}
	list, err := f.store.ListOrders(ctx, stranger)
	if err != nil || len(list) != 0 {
		t.Errorf("the stranger's list = %+v, %v; want empty", list, err)
	}
	// Nothing happened to the owner's order.
	if got, _, _ := f.store.GetOrder(ctx, owner, order.ID); got.Status != orders.StatusPending {
		t.Errorf("owner's order = %+v, want pending", got)
	}
	// Keys of an unpaid order never leak, not even through the owner's own reads.
	if got, _, _ := f.store.GetOrder(ctx, owner, order.ID); len(got.Items[0].Keys) != 0 {
		t.Errorf("a pending order shows keys: %v", got.Items[0].Keys)
	}
}

// K6 - two buyers, one last key. Both fire at the same moment, with real transactions on a real
// database. Exactly one gets the order; the other is told the cart changed; the key is reserved
// once. Repeated, because a race that happens "usually" is not a proof.
func TestK6_twoBuyersOneLastKey(t *testing.T) {
	f := newFixture(t)
	for round := 0; round < 25; round++ {
		a, b := f.newUser(t), f.newUser(t)
		o := f.newOffer(t, 1000, 1)

		type result struct {
			order orders.Order
			err   error
		}
		results := make(chan result, 2)
		start := make(chan struct{})
		for _, buyer := range []int64{a, b} {
			go func() {
				<-start
				order, _, err := f.create(buyer, o, 1)
				results <- result{order, err}
			}()
		}
		close(start)

		wins, losses := 0, 0
		for i := 0; i < 2; i++ {
			r := <-results
			switch {
			case r.err == nil:
				wins++
			default:
				lines := changesOf(t, r.err)
				if len(lines) != 1 || !slices.Equal(lines[0].Changes, []string{orders.ChangeUnavailable}) || lines[0].Quantity != 0 {
					t.Fatalf("round %d: the loser's lines = %+v, want one unavailable line", round, lines)
				}
				losses++
			}
		}
		if wins != 1 || losses != 1 {
			t.Fatalf("round %d: %d winners and %d losers, want 1 and 1", round, wins, losses)
		}
		if c := f.keyCounts(t, o.id); c["reserved"] != 1 || c["available"] != 0 {
			t.Fatalf("round %d: key states %v, want exactly 1 reserved", round, c)
		}
		if n := f.count(t, `SELECT count(*) FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE oi.offer_id = $1`, o.id); n != 1 {
			t.Fatalf("round %d: %d orders for the offer, want 1", round, n)
		}
	}
}

// The same race with a crowd: 10 buyers, 4 keys, one key each. Exactly 4 orders, and no key is
// reserved by two order items (every key points to a DIFFERENT item).
func TestK6_manyBuyersFewKeys(t *testing.T) {
	f := newFixture(t)
	const buyers, keys = 10, 4
	o := f.newOffer(t, 1000, keys)

	results := make(chan error, buyers)
	start := make(chan struct{})
	for i := 0; i < buyers; i++ {
		buyer := f.newUser(t)
		go func() {
			<-start
			_, _, err := f.create(buyer, o, 1)
			results <- err
		}()
	}
	close(start)

	wins := 0
	for i := 0; i < buyers; i++ {
		err := <-results
		if err == nil {
			wins++
			continue
		}
		var ce *orders.ChangedError
		if !errors.As(err, &ce) {
			t.Fatalf("a buyer failed with %v, want a clean ChangedError", err)
		}
	}
	if wins != keys {
		t.Errorf("%d buyers got an order, want exactly %d (one per key)", wins, keys)
	}
	if c := f.keyCounts(t, o.id); c["reserved"] != keys {
		t.Errorf("key states %v, want %d reserved", c, keys)
	}
	if n := f.count(t, `SELECT count(DISTINCT order_item_id) FROM keys WHERE offer_id = $1 AND status = 'reserved'`, o.id); n != keys {
		t.Errorf("%d distinct order items hold the keys, want %d (one key each)", n, keys)
	}
}

// The database itself refuses what the Go code should never try (defence in depth).
func TestDatabaseGuards(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	o := f.newOffer(t, 1000, 1)
	order := f.mustCreate(t, buyer, o, 1)
	if _, err := f.pay(buyer, order.ID, orders.OutcomeSuccess); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	// A second SUCCEEDED payment for one order: refused by the partial unique index.
	_, err := f.pool.Exec(ctx, `INSERT INTO payments (order_id, outcome, amount_cents) VALUES ($1::uuid, 'succeeded', 1000)`, order.ID)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		t.Errorf("second succeeded payment: err = %v, want unique violation 23505", err)
	}
	// A "paid" order must have paid_at, a pending one must not.
	_, err = f.pool.Exec(ctx, `UPDATE orders SET paid_at = NULL WHERE id = $1::uuid`, order.ID)
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Errorf("paid order without paid_at: err = %v, want check violation 23514", err)
	}
	// An available key never belongs to an order item.
	_, err = f.pool.Exec(ctx, `UPDATE keys SET status = 'available', sold_at = NULL WHERE offer_id = $1`, o.id)
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Errorf("available key with an order item: err = %v, want check violation 23514", err)
	}
	// Quantity limits and the same offer twice in one order.
	_, err = f.pool.Exec(ctx, `UPDATE order_items SET quantity = 6 WHERE order_id = $1::uuid`, order.ID)
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Errorf("quantity 6: err = %v, want check violation 23514", err)
	}
}

// A catalog re-seed must not silently destroy order history: Reset refuses while orders exist.
func TestSeedReset_refusesWhenOrdersExist(t *testing.T) {
	f := newFixture(t)
	buyer := f.newUser(t)
	f.mustCreate(t, buyer, f.newOffer(t, 1000, 1), 1)

	ctx := context.Background()
	tx, err := f.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx) // Reset must have changed nothing; the rollback is only tidiness
	if err := seedgen.Reset(ctx, tx); !errors.Is(err, seedgen.ErrOrdersExist) {
		t.Fatalf("Reset with orders: err = %v, want seedgen.ErrOrdersExist", err)
	}
}
