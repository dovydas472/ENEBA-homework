import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client.ts";
import {
  cancelOrder,
  cartChangedLines,
  createOrder,
  getOrder,
  isHttpStatus,
  isPaymentDeclined,
  isReservationExpired,
  isTooManyPendingOrders,
  listOrders,
  newIdempotencyKey,
  orderErrorMessage,
  payOrder,
  quoteCart,
} from "./orders.ts";
import type { CheckoutLine, Order } from "./types.ts";

const order: Order = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  status: "pending",
  totalCents: 3000,
  createdAt: "2026-01-01T10:00:00Z",
  reservedUntil: "2026-01-01T10:15:00Z",
  paidAt: null,
  items: [],
};
const items = [{ offerId: 4, quantity: 2, expectedPriceCents: 1500 }];

function mockFetch(response: () => Response) {
  const fake = vi.fn<typeof fetch>(async () => response());
  vi.stubGlobal("fetch", fake);
  return fake;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("requests", () => {
  it("quoteCart POSTs {items} and returns the quote", async () => {
    const quote = { lines: [], totalCents: 0 };
    const fake = mockFetch(() => json(quote));
    await expect(quoteCart(items)).resolves.toEqual(quote);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe("/api/checkout/quote");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ items });
  });

  it("createOrder POSTs the idempotency key and items and returns the order", async () => {
    const fake = mockFetch(() => json({ order }, 201));
    await expect(createOrder("key-1", items)).resolves.toEqual(order);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe("/api/orders");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual({ idempotencyKey: "key-1", items });
  });

  it("listOrders unwraps {orders}", async () => {
    mockFetch(() => json({ orders: [{ id: "a" }] }));
    await expect(listOrders()).resolves.toEqual([{ id: "a" }]);
  });

  it("getOrder GETs the id (URL-encoded) and returns the order with the server time", async () => {
    const body = { order, serverTime: "2026-01-01T10:01:00Z" };
    const fake = mockFetch(() => json(body));
    await expect(getOrder("a/b")).resolves.toEqual(body);
    expect(fake.mock.calls[0][0]).toBe("/api/orders/a%2Fb");
  });

  it("payOrder POSTs the outcome", async () => {
    const paid = { ...order, status: "paid" as const };
    const fake = mockFetch(() => json({ order: paid }));
    await expect(payOrder(order.id, "success")).resolves.toEqual(paid);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe(`/api/orders/${order.id}/pay`);
    expect(JSON.parse(init?.body as string)).toEqual({ outcome: "success" });
  });

  it("cancelOrder POSTs without a body", async () => {
    const fake = mockFetch(() => json({ order: { ...order, status: "cancelled" } }));
    await cancelOrder(order.id);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe(`/api/orders/${order.id}/cancel`);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
  });
});

describe("error helpers", () => {
  const line: CheckoutLine = {
    offerId: 4,
    quantity: 0,
    unitPriceCents: 1500,
    stock: 0,
    maxQuantity: 0,
    available: false,
    productSlug: "p",
    title: "T",
    edition: "Standard",
    platformName: "PC",
    regionName: "Global",
    sellerName: "S",
    coverUrl: null,
    changes: ["unavailable"],
  };
  const http = (status: number, body?: unknown) => new ApiError("http", `HTTP ${status}`, status, body);

  it("createOrder surfaces the 409 body, and cartChangedLines reads its lines", async () => {
    mockFetch(() => json({ error: "cart_changed", lines: [line] }, 409));
    const err = await createOrder("k", items).catch((e: unknown) => e);
    expect(cartChangedLines(err)).toEqual([line]);
  });

  it("cartChangedLines is null for every other error", () => {
    expect(cartChangedLines(http(409, { error: "Reservation expired" }))).toBeNull();
    expect(cartChangedLines(http(400, { error: "cart_changed", lines: [] }))).toBeNull();
    expect(cartChangedLines(new ApiError("network", "Network error"))).toBeNull();
    expect(cartChangedLines(new Error("boom"))).toBeNull();
  });

  it("isPaymentDeclined is true only for 402", () => {
    expect(isPaymentDeclined(http(402, { error: "Payment declined (simulated)" }))).toBe(true);
    expect(isPaymentDeclined(http(409))).toBe(false);
    expect(isPaymentDeclined(new Error("x"))).toBe(false);
  });

  it("isReservationExpired tells 'expired' from other 409s", () => {
    expect(isReservationExpired(http(409, { error: "Reservation expired" }))).toBe(true);
    expect(isReservationExpired(http(409, { error: "Order is not payable" }))).toBe(false);
    expect(isReservationExpired(http(402))).toBe(false);
  });
});

describe("isTooManyPendingOrders", () => {
  const http = (status: number, body?: unknown) => new ApiError("http", `HTTP ${status}`, status, body);

  it("recognises the cap answer of POST /api/orders and nothing else", async () => {
    mockFetch(() => json({ error: "Too many unpaid orders – pay or cancel one first" }, 409));
    const err = await createOrder("k", items).catch((e: unknown) => e);
    expect(isTooManyPendingOrders(err)).toBe(true);
    expect(cartChangedLines(err)).toBeNull();
    expect(isTooManyPendingOrders(http(409, { error: "cart_changed", lines: [] }))).toBe(false);
    expect(isTooManyPendingOrders(http(402))).toBe(false);
    expect(isTooManyPendingOrders(new Error("x"))).toBe(false);
  });
});

// Task 16b: the UI's readers - which statuses are which, and which messages may be shown (never a raw 5xx text).
describe("isHttpStatus / orderErrorMessage", () => {
  const http = (status: number, body?: unknown) => new ApiError("http", `HTTP ${status}`, status, body);

  it("isHttpStatus is false for network errors and plain errors", () => {
    expect(isHttpStatus(http(404), 404)).toBe(true);
    expect(isHttpStatus(new ApiError("network", "Network error"), 0)).toBe(false);
    expect(isHttpStatus(new Error("x"), 404)).toBe(false);
    expect(isHttpStatus(null, 404)).toBe(false);
  });

  it("shows the server's text for 400, 402 and 409 (including the unpaid-order cap)", () => {
    expect(orderErrorMessage(http(400, { error: "At most 20 lines" }))).toBe("At most 20 lines");
    expect(orderErrorMessage(http(402, { error: "Payment declined (simulated)" }))).toBe("Payment declined (simulated)");
    expect(orderErrorMessage(http(409, { error: "Too many unpaid orders – pay or cancel one first" }))).toBe(
      "Too many unpaid orders – pay or cancel one first",
    );
  });

  it("a generic sentence for 5xx, other 4xx, missing text and unknown errors", () => {
    const generic = "Something went wrong. Please try again.";
    expect(orderErrorMessage(http(500, { error: "pq: relation orders does not exist" }))).toBe(generic);
    expect(orderErrorMessage(http(503, { error: "database unavailable" }))).toBe(generic);
    expect(orderErrorMessage(http(404, { error: "Not found" }))).toBe(generic);
    expect(orderErrorMessage(http(409))).toBe(generic);
    expect(orderErrorMessage(new Error("TypeError in our code"))).toBe(generic);
  });

  it("network and timeout: check the connection", () => {
    const text = "Could not reach the server. Check your connection and try again.";
    expect(orderErrorMessage(new ApiError("network", "Network error"))).toBe(text);
    expect(orderErrorMessage(new ApiError("timeout", "Request timed out"))).toBe(text);
  });
});

describe("newIdempotencyKey", () => {
  it("is a UUID and different every time", () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});
