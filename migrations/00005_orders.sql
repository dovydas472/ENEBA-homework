-- +goose Up
-- Checkout (Task 16a): orders, their items, payment attempts, and the link from a key to the
-- order item that reserved / bought it. Design and reasons: docs/DATA_MODEL.md ("Commerce tables").
--
-- Backward compatible (expand/contract): three NEW tables and one NEW nullable column.
-- The code that is live while this runs never reads or writes any of them.

-- One purchase. The id is a UUID: it appears in URLs and must not reveal how many orders exist.
CREATE TABLE orders (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- RESTRICT: orders are financial records, a user who has orders is not hard-deleted.
    user_id         bigint      NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    status          text        NOT NULL DEFAULT 'pending',
    total_cents     integer     NOT NULL,
    -- Sent by the client, one per checkout attempt. UNIQUE (user_id, idempotency_key) below makes a
    -- double click or a network retry return the SAME order instead of reserving keys twice.
    idempotency_key uuid        NOT NULL,
    -- The keys of a pending order are reserved until then; after it the order can no longer be paid.
    reserved_until  timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    paid_at         timestamptz,
    CONSTRAINT orders_status_valid CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
    CONSTRAINT orders_total_positive CHECK (total_cents > 0),
    -- paid <=> paid_at is set
    CONSTRAINT orders_paid_at_only_when_paid CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
    CONSTRAINT orders_user_idempotency_key UNIQUE (user_id, idempotency_key)
);
-- "My orders, newest first".
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);

-- One line of an order: one offer, N keys. The text columns are SNAPSHOTS: the order must look the
-- same even if the catalog changes later (a seller is renamed, a price changes).
CREATE TABLE order_items (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- The one CASCADE next to sessions: items have no meaning without their order.
    order_id         uuid   NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    offer_id         bigint NOT NULL REFERENCES offers (id) ON DELETE RESTRICT,
    quantity         integer NOT NULL,
    unit_price_cents integer NOT NULL,
    product_slug     text   NOT NULL,
    product_title    text   NOT NULL,
    edition          text   NOT NULL,
    platform_name    text   NOT NULL,
    region_name      text   NOT NULL,
    seller_name      text   NOT NULL,
    CONSTRAINT order_items_quantity_range CHECK (quantity BETWEEN 1 AND 5),
    CONSTRAINT order_items_price_positive CHECK (unit_price_cents > 0),
    CONSTRAINT order_items_snapshots_not_blank CHECK (
        btrim(product_slug) <> '' AND btrim(product_title) <> '' AND btrim(edition) <> ''
        AND btrim(platform_name) <> '' AND btrim(region_name) <> '' AND btrim(seller_name) <> ''
    ),
    -- One line per offer in an order (more keys = a higher quantity). Leading order_id serves the FK.
    CONSTRAINT order_items_order_offer_key UNIQUE (order_id, offer_id)
);
-- The RESTRICT check when an offer is deleted.
CREATE INDEX order_items_offer_id_idx ON order_items (offer_id);

-- Which order item reserved / bought a key. NULL = nobody (the key is available, or it is seed
-- background data that was never part of an order). A reservation therefore has an explicit owner:
-- "release my keys" and "sell my keys" only ever touch rows with MY order_item_id.
ALTER TABLE keys ADD COLUMN order_item_id bigint REFERENCES order_items (id) ON DELETE RESTRICT;
-- An available key never belongs to an order item. (Not the reverse: the seed contains reserved and
-- sold keys without an order item, so "reserved/sold => order_item_id set" would reject seed data.)
ALTER TABLE keys ADD CONSTRAINT keys_available_has_no_order_item
    CHECK (status <> 'available' OR order_item_id IS NULL);
-- "Keys of this order". Partial: most keys never belong to an order.
CREATE INDEX keys_order_item_id_idx ON keys (order_item_id) WHERE order_item_id IS NOT NULL;

-- Payment ATTEMPTS (simulated, no card data at all). One order can have several: declined, then retry.
CREATE TABLE payments (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id     uuid        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
    outcome      text        NOT NULL,
    amount_cents integer     NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT payments_outcome_valid CHECK (outcome IN ('succeeded', 'declined')),
    CONSTRAINT payments_amount_positive CHECK (amount_cents > 0)
);
CREATE INDEX payments_order_id_idx ON payments (order_id);
-- At most ONE successful payment per order: a double charge is impossible at the database level,
-- whatever the Go code does.
CREATE UNIQUE INDEX payments_one_success_per_order ON payments (order_id) WHERE outcome = 'succeeded';

-- +goose Down
-- Reverse dependency order. Dropping the column also drops its constraint and index.
ALTER TABLE keys DROP COLUMN IF EXISTS order_item_id;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
