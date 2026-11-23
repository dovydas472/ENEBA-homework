// Test data (used only by *.test.ts(x)): cart lines, quote lines and orders in the exact API shape (Task 16a §4).
import type { Order, OrderItem, OrderSummary, QuoteLine } from "../../api/types.ts";
import type { CartLine } from "../cart/cart.ts";

export function makeCartLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    offerId: 15,
    quantity: 1,
    productSlug: "the-witcher-3-wild-hunt-steam-global",
    title: "The Witcher 3: Wild Hunt",
    edition: "Standard",
    platformName: "Steam",
    regionName: "GLOBAL",
    coverUrl: "https://images.example/witcher.jpg",
    sellerName: "Retro Ridge",
    priceCents: 1099,
    stock: 6,
    ...overrides,
  };
}

/** A second, different line (another game, another seller). */
export function makeOtherLine(overrides: Partial<CartLine> = {}): CartLine {
  return makeCartLine({
    offerId: 27,
    productSlug: "hades-steam-global",
    title: "Hades",
    edition: "Game of the Year Edition",
    sellerName: "Quest Depot",
    coverUrl: null,
    priceCents: 1499,
    stock: 3,
    ...overrides,
  });
}

/** The server's view of a cart line: by default exactly what the line says (nothing changed). */
export function quoteFor(line: CartLine, overrides: Partial<QuoteLine> = {}): QuoteLine {
  return {
    offerId: line.offerId,
    quantity: line.quantity,
    unitPriceCents: line.priceCents,
    stock: line.stock,
    maxQuantity: Math.min(line.stock, 5),
    available: true,
    productSlug: line.productSlug,
    title: line.title,
    edition: line.edition,
    platformName: line.platformName,
    regionName: line.regionName,
    sellerName: line.sellerName,
    coverUrl: line.coverUrl,
    changes: [],
    ...overrides,
  };
}

export function orderItemFor(line: CartLine, overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    offerId: line.offerId,
    productSlug: line.productSlug,
    title: line.title,
    edition: line.edition,
    platformName: line.platformName,
    regionName: line.regionName,
    sellerName: line.sellerName,
    unitPriceCents: line.priceCents,
    quantity: line.quantity,
    ...overrides,
  };
}

export const ORDER_ID = "0b9f2c1e-4d5a-4f3b-9a7c-2e6d8f1a3b5c";

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    status: "pending",
    totalCents: 1099 + 2 * 1499,
    createdAt: "2026-11-22T12:00:00Z",
    reservedUntil: "2026-11-22T12:15:00Z",
    paidAt: null,
    items: [orderItemFor(makeCartLine()), orderItemFor(makeOtherLine({ quantity: 2 }))],
    ...overrides,
  };
}

/** The same order after a successful payment, with its fake keys. */
export function makePaidOrder(overrides: Partial<Order> = {}): Order {
  const order = makeOrder({ status: "paid", paidAt: "2026-11-22T12:03:00Z" });
  return {
    ...order,
    items: [
      { ...order.items[0], keys: ["DEMO-AB12-CD34-EF56"] },
      { ...order.items[1], keys: ["DEMO-GH78-JK90-LM12", "DEMO-NP34-QR56-ST78"] },
    ],
    ...overrides,
  };
}

export function summaryOf(order: Order): OrderSummary {
  return {
    id: order.id,
    status: order.status,
    totalCents: order.totalCents,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: order.createdAt,
    reservedUntil: order.reservedUntil,
  };
}
