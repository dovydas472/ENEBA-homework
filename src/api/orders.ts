// Typed functions for the checkout endpoints (Task 16a, pkg/orders). Every call goes through apiFetch.
// No UI here: the cart and checkout screens (Task 16b) call these from TanStack Query.
import { ApiError, apiFetch, type ApiOptions } from "./client.ts";
import type {
  CartChangedBody,
  CartLineInput,
  CheckoutLine,
  Order,
  OrderDetailResponse,
  OrderResponse,
  OrdersResponse,
  OrderSummary,
  PaymentOutcome,
  Quote,
} from "./types.ts";

/** POST with a JSON body. The browser adds the Origin header itself; the server checks it (CSRF). */
function postJSON<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** POST /api/checkout/quote (no sign-in): re-prices the cart; each line says what can really be bought. */
export function quoteCart(items: CartLineInput[], options?: ApiOptions): Promise<Quote> {
  return postJSON<Quote>("/api/checkout/quote", { items }, options);
}

/**
 * POST /api/orders: creates a pending order and reserves its keys for 15 minutes.
 * Send ONE `idempotencyKey` (a UUID, see `newIdempotencyKey`) per checkout attempt and reuse it for a
 * retry or a double click: the server then returns the same order instead of reserving twice.
 * Throws ApiError status 409 when the cart changed (read it with `cartChangedLines`), 401 when signed out.
 */
export async function createOrder(idempotencyKey: string, items: CartLineInput[], options?: ApiOptions): Promise<Order> {
  return (await postJSON<OrderResponse>("/api/orders", { idempotencyKey, items }, options)).order;
}

/** GET /api/orders: my orders, newest first. */
export async function listOrders(options?: ApiOptions): Promise<OrderSummary[]> {
  return (await apiFetch<OrdersResponse>("/api/orders", options)).orders;
}

/** GET /api/orders/{id}: one of my orders (404 for anything else) and the server's time. */
export function getOrder(id: string, options?: ApiOptions): Promise<OrderDetailResponse> {
  return apiFetch<OrderDetailResponse>(`/api/orders/${encodeURIComponent(id)}`, options);
}

/**
 * POST /api/orders/{id}/pay: the simulated payment. Resolves with the paid order (its `keys` are filled).
 * Throws ApiError: 402 declined (the order stays pending, the buyer may try again),
 * 409 reservation expired / not payable, 404 not my order.
 */
export async function payOrder(id: string, outcome: PaymentOutcome, options?: ApiOptions): Promise<Order> {
  return (await postJSON<OrderResponse>(`/api/orders/${encodeURIComponent(id)}/pay`, { outcome }, options)).order;
}

/** POST /api/orders/{id}/cancel: releases the reserved keys. 409 when the order is not pending. */
export async function cancelOrder(id: string, options?: ApiOptions): Promise<Order> {
  return (await postJSON<OrderResponse>(`/api/orders/${encodeURIComponent(id)}/cancel`, undefined, options)).order;
}

/** A fresh idempotency key (a UUID). Make it ONCE per checkout attempt, not once per click. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** The lines of a "cart changed" answer (409 {error: "cart_changed", lines}); null for any other error. */
export function cartChangedLines(err: unknown): CheckoutLine[] | null {
  if (!(err instanceof ApiError) || err.code !== "http" || err.status !== 409) return null;
  const body = err.body as Partial<CartChangedBody> | undefined;
  return body?.error === "cart_changed" && Array.isArray(body.lines) ? body.lines : null;
}

/** True when the buyer's simulated payment was declined (402): the order is still pending. */
export function isPaymentDeclined(err: unknown): boolean {
  return err instanceof ApiError && err.code === "http" && err.status === 402;
}

/** True for the 409 "Reservation expired" answer of pay (other 409s, e.g. "not payable", are false). */
export function isReservationExpired(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.code !== "http" || err.status !== 409) return false;
  return (err.body as { error?: unknown } | undefined)?.error === "Reservation expired";
}
