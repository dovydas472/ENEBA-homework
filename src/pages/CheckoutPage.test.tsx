// @vitest-environment jsdom
// The payment page (/checkout/:orderId) inside the real app routes, with apiFetch answered by an in-memory fake server:
// countdown (fake clock + a server clock that is 5 minutes ahead), the simulated payment (no card fields), decline,
// expiry, success (cart cleaned, order page), cancel, and 404.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../api/auth.ts";
import { ApiError, apiFetch } from "../api/client.ts";
import type { Order } from "../api/types.ts";
import { fakeAuthServer, newFakeAuthState, type FakeAuthState } from "../features/auth/fakeAuthServer.ts";
import { cartStore } from "../features/cart/cartStore.ts";
import { makeCartLine, makeOrder, makeOtherLine, makePaidOrder, ORDER_ID } from "../features/checkout/fixtures.ts";
import { $, $$, buttonByText, click, mountApp, resetCheckoutState, toastText, unmountApp, urlOf } from "../features/checkout/testApp.tsx";

vi.mock("../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client.ts")>()),
  apiFetch: vi.fn(),
}));

const me: User = { id: 7, email: "me@example.com", isDemo: false };
const url = `/checkout/${ORDER_ID}`;
let server: FakeAuthState;
/** What GET /api/orders/{id} answers. Server clock 12:05, reserved until 12:20 = 15 minutes left. */
let current: { order: Order; serverTime: string };

beforeEach(() => {
  // Fake only the clock and setInterval (the countdown); TanStack Query's own timers stay real.
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-11-22T12:00:00Z")); // the user's clock is 5 minutes behind the server
  resetCheckoutState();
  server = newFakeAuthState();
  server.user = me;
  current = { order: makeOrder({ reservedUntil: "2026-11-22T12:20:00Z" }), serverTime: "2026-11-22T12:05:00Z" };
  server.handlers[`GET /api/orders/${ORDER_ID}`] = () => current;
  server.handlers["GET /api/orders"] = () => ({ orders: [] });
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(fakeAuthServer(server));
});
afterEach(() => {
  unmountApp();
  vi.useRealTimers();
});

const payPanel = () => $("section[aria-labelledby=payment-title]")!;
const timer = () => $("[role=timer]")?.textContent;
const payButton = () => buttonByText("Pay", payPanel());
const requests = (key: string) => server.requests.filter((r) => r.key === key);
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
async function choose(label: "Success" | "Decline") {
  const radio = $$<HTMLLabelElement>("label").find((l) => l.textContent === label)!.querySelector("input")!;
  await click(radio);
}

describe("payment page: content", () => {
  it("shows the order summary, the total and 'Pay €40.97'", async () => {
    await mountApp(url);
    expect(document.title).toBe("Payment – EneHomeworkBa");
    const order = $("section[aria-labelledby=order-title]")!;
    expect(order.textContent).toContain("The Witcher 3: Wild Hunt");
    expect(order.textContent).toContain("2 × €14.99");
    expect(payPanel().textContent).toContain("Total: €40.97");
    expect(payButton().textContent).toBe("Pay €40.97");
  });

  it("the simulated payment box: clearly labelled, Success / Decline radios, and NO card fields anywhere", async () => {
    await mountApp(url);
    expect($("fieldset legend")?.textContent).toBe("Simulated payment – no real money, no card details");
    const inputs = $$<HTMLInputElement>("main input");
    expect(inputs.map((i) => i.type)).toEqual(["radio", "radio"]);
    expect($$("label").map((l) => l.textContent)).toEqual(["Success", "Decline"]);
    expect($("main [autocomplete^=cc-]")).toBeNull();
    expect($("main")!.textContent!.toLowerCase()).not.toMatch(/card number|cvc|cvv|expiry/);
  });
});

describe("payment page: countdown with the server's clock", () => {
  it("'Reserved for 15:00' although the user's clock says 20 minutes are left; it counts down every second", async () => {
    await mountApp(url);
    expect(payPanel().textContent).toContain("Reserved for 15:00");
    await tick(1000);
    expect(timer()).toBe("14:59");
    await tick(60_000);
    expect(timer()).toBe("13:59");
  });

  it("at 00:00 it shows the expired state with 'Back to cart' (the cart is still there)", async () => {
    cartStore.add(makeCartLine());
    const { router } = await mountApp(url);
    await tick(15 * 60_000);
    expect($("main h1")?.textContent).toBe("Your reservation has expired");
    expect($("main a[href='/cart']")?.textContent).toBe("Back to cart");
    expect(cartStore.getSnapshot()).toHaveLength(1);
    await click($<HTMLAnchorElement>("main a[href='/cart']")!);
    expect(urlOf(router)).toBe("/cart");
  });

  it("an order the server already marked expired shows the same state at once", async () => {
    current = { ...current, order: { ...current.order, status: "expired" } };
    await mountApp(url);
    expect($("main h1")?.textContent).toBe("Your reservation has expired");
  });
});

describe("payment page: paying", () => {
  it("decline: POST pay {outcome: decline} -> a message, the order stays payable; then success works", async () => {
    server.handlers[`POST /api/orders/${ORDER_ID}/pay`] = (body) => {
      if ((body as { outcome: string }).outcome === "decline") {
        throw new ApiError("http", "HTTP 402", 402, { error: "Payment declined (simulated)" });
      }
      return { order: makePaidOrder() };
    };
    const { router } = await mountApp(url);

    await choose("Decline");
    await click(payButton());
    expect(requests(`POST /api/orders/${ORDER_ID}/pay`).map((r) => r.body)).toEqual([{ outcome: "decline" }]);
    expect($("main [role=alert]")?.textContent).toBe("Payment declined (simulated). No money was taken – you can try again.");
    expect(urlOf(router)).toBe(url);

    await choose("Success");
    await click(payButton());
    expect(requests(`POST /api/orders/${ORDER_ID}/pay`).map((r) => r.body)).toEqual([{ outcome: "decline" }, { outcome: "success" }]);
    expect(urlOf(router)).toBe(`/orders/${ORDER_ID}`);
  });

  it("success: the bought lines leave the cart (others stay), a toast, and the order page", async () => {
    cartStore.add(makeCartLine());
    cartStore.add(makeOtherLine());
    cartStore.setQuantity(27, 2);
    cartStore.add(makeCartLine({ offerId: 99, title: "Not in this order" }));
    server.handlers[`POST /api/orders/${ORDER_ID}/pay`] = () => ({ order: makePaidOrder() });
    let paid = false;
    server.handlers[`GET /api/orders/${ORDER_ID}`] = () => (paid ? { order: makePaidOrder(), serverTime: current.serverTime } : current);
    const { router } = await mountApp(url);

    paid = true;
    await click(payButton());
    expect(cartStore.getSnapshot().map((l) => l.offerId)).toEqual([99]);
    expect(urlOf(router)).toBe(`/orders/${ORDER_ID}`);
    expect(toastText()).toBe("Payment successful – your keys are ready");
  });

  it("a double click on Pay sends one request", async () => {
    let finish: (value: unknown) => void = () => {};
    server.handlers[`POST /api/orders/${ORDER_ID}/pay`] = () => new Promise((resolve) => (finish = resolve));
    await mountApp(url);
    await click(payButton());
    expect(payButton().getAttribute("aria-busy")).toBe("true");
    await click(payButton());
    expect(requests(`POST /api/orders/${ORDER_ID}/pay`)).toHaveLength(1);
    finish({ order: makePaidOrder() });
  });

  it("409 'Reservation expired' from the server shows the expired state", async () => {
    server.handlers[`POST /api/orders/${ORDER_ID}/pay`] = () => {
      throw new ApiError("http", "HTTP 409", 409, { error: "Reservation expired" });
    };
    await mountApp(url);
    await click(payButton());
    expect($("main h1")?.textContent).toBe("Your reservation has expired");
  });

  it("an already paid order goes straight to its order page", async () => {
    current = { ...current, order: makePaidOrder() };
    const { router } = await mountApp(url);
    expect(urlOf(router)).toBe(`/orders/${ORDER_ID}`);
  });
});

describe("payment page: cancel and not found", () => {
  it("'Cancel order' cancels it and goes back to the cart", async () => {
    server.handlers[`POST /api/orders/${ORDER_ID}/cancel`] = () => ({ order: makeOrder({ status: "cancelled" }) });
    const { router } = await mountApp(url);
    await click(buttonByText("Cancel order", payPanel()));
    expect(requests(`POST /api/orders/${ORDER_ID}/cancel`)).toHaveLength(1);
    expect(urlOf(router)).toBe("/cart");
    expect(toastText()).toBe("Order cancelled. Your cart is still here.");
  });

  it("unknown or another user's order: the 404 page", async () => {
    server.handlers[`GET /api/orders/${ORDER_ID}`] = () => {
      throw new ApiError("http", "HTTP 404", 404, { error: "Not found" });
    };
    await mountApp(url);
    expect($("main h1")?.textContent).toBe("Page not found");
    expect(document.title).toBe("Page not found – EneHomeworkBa");
  });

  it("signed out: the sign-in page, which brings the user back here", async () => {
    server.user = null;
    const { router } = await mountApp(url);
    expect(urlOf(router)).toBe(`/login?next=${encodeURIComponent(url)}`);
  });
});
