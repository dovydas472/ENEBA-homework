// @vitest-environment jsdom
// The cart page and "Checkout" inside the real app routes, with apiFetch answered by an in-memory fake server:
// the quote is applied (price change, quantity reduced, unavailable), stepper limits, remove, empty state, totals,
// and checkout (sign-in redirect, one idempotency key per attempt, 409 cart_changed).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../api/auth.ts";
import { ApiError, apiFetch } from "../api/client.ts";
import type { CartLineInput, CheckoutLine } from "../api/types.ts";
import { fakeAuthServer, newFakeAuthState, type FakeAuthState } from "../features/auth/fakeAuthServer.ts";
import type { CartLine } from "../features/cart/cart.ts";
import { cartStore } from "../features/cart/cartStore.ts";
import { makeCartLine, makeOrder, makeOtherLine, ORDER_ID, quoteFor } from "../features/checkout/fixtures.ts";
import { $, $$, buttonByText, click, flush, mountApp, resetCheckoutState, unmountApp, urlOf } from "../features/checkout/testApp.tsx";

vi.mock("../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client.ts")>()),
  apiFetch: vi.fn(),
}));

const me: User = { id: 7, email: "me@example.com", isDemo: false };
let server: FakeAuthState;
/** What the fake quote endpoint answers for a line (default: nothing changed). */
let quoteAnswer: (item: CartLineInput, line: CartLine) => CheckoutLine;

/** Puts lines into the real cart store (= localStorage) the way "Add to cart" would. */
function fillCart(...lines: CartLine[]) {
  for (const line of lines) {
    cartStore.add(line);
    cartStore.setQuantity(line.offerId, line.quantity);
  }
}

beforeEach(() => {
  resetCheckoutState();
  sessionStorage.clear();
  server = newFakeAuthState();
  quoteAnswer = (_item, line) => quoteFor(line);
  server.handlers["POST /api/checkout/quote"] = (body) => {
    const items = (body as { items: CartLineInput[] }).items;
    const lines = items.map((item) => {
      const stored = cartStore.getSnapshot().find((l) => l.offerId === item.offerId)!;
      return quoteAnswer(item, { ...stored, quantity: item.quantity, priceCents: item.expectedPriceCents });
    });
    return { lines, totalCents: 0 };
  };
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(fakeAuthServer(server));
});
afterEach(unmountApp);

const lineItems = () => $$("main li[data-unavailable], main ul > li");
const lineOf = (title: string) => lineItems().find((li) => li.querySelector("h2")?.textContent === title)!;
const summary = () => $("section[aria-labelledby=summary-title]")!;
const totalText = () => summary().querySelector("p:last-child span")?.textContent;
const requests = (key: string) => server.requests.filter((r) => r.key === key);

describe("cart page: content", () => {
  it("empty cart: 'Your cart is empty' with 'Browse the store', no quote request", async () => {
    await mountApp("/cart");
    expect($("main h1")?.textContent).toBe("Your cart is empty");
    expect($("main a[href='/store']")?.textContent).toBe("Browse the store");
    expect(requests("POST /api/checkout/quote")).toEqual([]);
  });

  it("each line: cover, seller, title, edition only when not Standard, platform · region, line total; summary total", async () => {
    fillCart(makeCartLine(), makeOtherLine({ quantity: 2 }));
    await mountApp("/cart");

    const witcher = lineOf("The Witcher 3: Wild Hunt");
    expect(witcher.querySelector("img")?.getAttribute("src")).toBe("https://images.example/witcher.jpg");
    expect(witcher.textContent).toContain("Sold by Retro Ridge");
    expect(witcher.textContent).toContain("Steam · GLOBAL");
    expect(witcher.textContent).not.toContain("Standard");
    expect(witcher.querySelector("h2 a")?.getAttribute("href")).toBe("/product/the-witcher-3-wild-hunt-steam-global");

    const hades = lineOf("Hades");
    expect(hades.textContent).toContain("Game of the Year Edition");
    expect(hades.textContent).toContain("€29.98"); // 2 × €14.99
    expect(hades.textContent).toContain("€14.99 each");

    expect(summary().textContent).toContain("3 products");
    expect(totalText()).toBe("€40.97");
  });

  it("asks the server for a quote with the price the user saw", async () => {
    fillCart(makeCartLine({ quantity: 2 }));
    await mountApp("/cart");
    expect(requests("POST /api/checkout/quote")[0].body).toEqual({
      items: [{ offerId: 15, quantity: 2, expectedPriceCents: 1099 }],
    });
  });
});

describe("cart page: the quote is applied", () => {
  it("price changed: notice 'Price updated: €10.99 → €12.49', new price in the cart and the total; the notice stays", async () => {
    fillCart(makeCartLine());
    quoteAnswer = (item, line) =>
      item.expectedPriceCents === 1099 ? quoteFor(line, { unitPriceCents: 1249, changes: ["price_changed"] }) : quoteFor(line);
    await mountApp("/cart");

    expect(lineOf("The Witcher 3: Wild Hunt").textContent).toContain("Price updated: €10.99 → €12.49");
    expect(cartStore.getSnapshot()[0].priceCents).toBe(1249);
    expect(totalText()).toBe("€12.49");
    // the cart changed, so it was checked once more ("nothing changed") - and the notice is still there
    expect(requests("POST /api/checkout/quote").length).toBe(2);
    expect(lineOf("The Witcher 3: Wild Hunt").textContent).toContain("Price updated: €10.99 → €12.49");
    expect($("main p[role=status]")?.textContent).toBe("Some items changed since you added them. Check the notes below.");
  });

  it("quantity reduced: 'Only 2 left – quantity reduced' and the stepper shows 2 (its + is disabled)", async () => {
    fillCart(makeCartLine({ quantity: 4 }));
    quoteAnswer = (_item, line) =>
      line.quantity > 2 ? quoteFor(line, { quantity: 2, stock: 2, maxQuantity: 2, changes: ["quantity_reduced"] }) : quoteFor(line, { stock: 2 });
    await mountApp("/cart");

    const line = lineOf("The Witcher 3: Wild Hunt");
    expect(line.textContent).toContain("Only 2 left – quantity reduced");
    expect(line.querySelector("[role=group] span")?.textContent).toBe("2");
    expect(line.querySelector<HTMLButtonElement>("button[aria-label='Increase quantity']")?.disabled).toBe(true);
    expect(cartStore.getSnapshot()[0]).toMatchObject({ quantity: 2, stock: 2 });
  });

  it("unavailable: 'No longer available', no stepper, left out of the total; it can be removed", async () => {
    fillCart(makeCartLine(), makeOtherLine());
    quoteAnswer = (_item, line) =>
      line.offerId === 27 ? quoteFor(line, { available: false, quantity: 0, stock: 0, changes: ["unavailable"] }) : quoteFor(line);
    await mountApp("/cart");

    const hades = lineOf("Hades");
    expect(hades.hasAttribute("data-unavailable")).toBe(true);
    expect(hades.textContent).toContain("No longer available");
    expect(hades.querySelector("[role=group]")).toBeNull();
    expect(totalText()).toBe("€10.99");
    expect(summary().textContent).toContain("1 product");
    expect(cartStore.getSnapshot().map((l) => l.offerId)).toEqual([15, 27]); // kept (valid) until the user removes it

    await click(hades.querySelector<HTMLButtonElement>("button[aria-label='Remove Hades from the cart']")!);
    expect(cartStore.getSnapshot().map((l) => l.offerId)).toEqual([15]);
  });

  it("every line unavailable: Checkout is disabled", async () => {
    fillCart(makeCartLine());
    quoteAnswer = (_item, line) => quoteFor(line, { available: false, quantity: 0, changes: ["unavailable"] });
    await mountApp("/cart");
    expect(buttonByText("Checkout", summary()).disabled).toBe(true);
    expect(totalText()).toBe("€0.00");
  });

  it("a failed quote says so and offers Try again; the cart still works", async () => {
    fillCart(makeCartLine());
    server.handlers["POST /api/checkout/quote"] = () => {
      throw new ApiError("network", "Network error");
    };
    await mountApp("/cart");
    expect($("main [role=alert]")?.textContent).toContain("Could not check the latest prices and stock.");
    expect(buttonByText("Checkout", summary()).disabled).toBe(false);
  });
});

describe("cart page: stepper and remove", () => {
  it("− is disabled at 1, + at min(stock, 5); a change updates the cart and asks again", async () => {
    fillCart(makeCartLine({ stock: 2 }));
    await mountApp("/cart");
    const line = () => lineOf("The Witcher 3: Wild Hunt");
    const minus = () => line().querySelector<HTMLButtonElement>("button[aria-label='Decrease quantity']")!;
    const plus = () => line().querySelector<HTMLButtonElement>("button[aria-label='Increase quantity']")!;
    expect(minus().disabled).toBe(true);
    expect(plus().disabled).toBe(false);

    await click(plus());
    expect(cartStore.getSnapshot()[0].quantity).toBe(2);
    expect(plus().disabled).toBe(true); // stock 2
    expect(minus().disabled).toBe(false);
    expect(requests("POST /api/checkout/quote").at(-1)?.body).toEqual({
      items: [{ offerId: 15, quantity: 2, expectedPriceCents: 1099 }],
    });
  });

  it("+ stops at 5 even with more stock", async () => {
    fillCart(makeCartLine({ quantity: 5, stock: 50 }));
    await mountApp("/cart");
    expect(lineOf("The Witcher 3: Wild Hunt").querySelector<HTMLButtonElement>("button[aria-label='Increase quantity']")?.disabled).toBe(true);
  });

  it("remove takes the line out, keeps focus on the cart; removing the last line shows the empty state", async () => {
    fillCart(makeCartLine(), makeOtherLine());
    await mountApp("/cart");
    await click($<HTMLButtonElement>("button[aria-label='Remove Hades from the cart']")!);
    expect(lineItems().map((li) => li.querySelector("h2")?.textContent)).toEqual(["The Witcher 3: Wild Hunt"]);
    expect(document.activeElement?.id).toBe("cart-title");
    expect($("header a[href='/cart']")?.textContent).toContain("1"); // header badge

    await click($<HTMLButtonElement>("button[aria-label='Remove The Witcher 3: Wild Hunt from the cart']")!);
    expect($("main h1")?.textContent).toBe("Your cart is empty");
  });
});

describe("checkout", () => {
  const checkoutButton = () => buttonByText("Checkout", summary());
  const orderPosts = () => requests("POST /api/orders");

  beforeEach(() => {
    server.handlers[`GET /api/orders/${ORDER_ID}`] = () => ({ order: makeOrder(), serverTime: "2026-11-22T12:00:00Z" });
  });

  it("signed out: goes to /login?next=/cart and creates nothing", async () => {
    fillCart(makeCartLine());
    const { router } = await mountApp("/cart");
    expect(summary().textContent).toContain("You will be asked to sign in first.");
    await click(checkoutButton());
    expect(urlOf(router)).toBe("/login?next=%2Fcart");
    expect(orderPosts()).toEqual([]);
  });

  it("signed in: sends a UUID idempotency key and the lines (without unavailable ones), then opens the payment page", async () => {
    server.user = me;
    fillCart(makeCartLine(), makeOtherLine());
    quoteAnswer = (_item, line) => (line.offerId === 27 ? quoteFor(line, { available: false, quantity: 0, changes: ["unavailable"] }) : quoteFor(line));
    server.handlers["POST /api/orders"] = () => ({ order: makeOrder() });
    const { router } = await mountApp("/cart");

    await click(checkoutButton());
    const [post] = orderPosts();
    const body = post.body as { idempotencyKey: string; items: CartLineInput[] };
    expect(body.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body.items).toEqual([{ offerId: 15, quantity: 1, expectedPriceCents: 1099 }]);
    expect(urlOf(router)).toBe(`/checkout/${ORDER_ID}`);
  });

  it("a retry after a network error sends the SAME key (the first request may have created the order)", async () => {
    server.user = me;
    fillCart(makeCartLine());
    let calls = 0;
    server.handlers["POST /api/orders"] = () => {
      calls++;
      if (calls === 1) throw new ApiError("network", "Network error");
      return { order: makeOrder() };
    };
    const { router } = await mountApp("/cart");

    await click(checkoutButton());
    expect($("main [role=alert]")?.textContent).toBe("Could not reach the server. Check your connection and try again.");
    expect(urlOf(router)).toBe("/cart");
    await click(checkoutButton());
    const keys = orderPosts().map((p) => (p.body as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(urlOf(router)).toBe(`/checkout/${ORDER_ID}`);
  });

  it("a double click sends one request (the button ignores clicks while it runs)", async () => {
    server.user = me;
    fillCart(makeCartLine());
    let finish: (value: unknown) => void = () => {};
    server.handlers["POST /api/orders"] = () => new Promise((resolve) => (finish = resolve));
    const { router } = await mountApp("/cart");

    await click(checkoutButton());
    expect(checkoutButton().getAttribute("aria-busy")).toBe("true");
    await click(checkoutButton());
    expect(orderPosts()).toHaveLength(1);
    finish({ order: makeOrder() });
    await flush();
    expect(urlOf(router)).toBe(`/checkout/${ORDER_ID}`);
  });

  it("409 cart_changed: the returned lines go into the cart with their notices; the next press is a new attempt", async () => {
    server.user = me;
    fillCart(makeCartLine(), makeOtherLine({ quantity: 3 }));
    const witcher = makeCartLine();
    const hades = makeOtherLine({ quantity: 3 });
    let calls = 0;
    server.handlers["POST /api/orders"] = () => {
      calls++;
      if (calls === 1) {
        throw new ApiError("http", "HTTP 409", 409, {
          error: "cart_changed",
          lines: [
            quoteFor(witcher, { unitPriceCents: 1199, changes: ["price_changed"] }),
            quoteFor(hades, { quantity: 1, stock: 1, maxQuantity: 1, changes: ["quantity_reduced"] }),
          ],
        });
      }
      return { order: makeOrder() };
    };
    const { router } = await mountApp("/cart");

    await click(checkoutButton());
    expect(urlOf(router)).toBe("/cart");
    expect($("main [role=alert]")).toBeNull(); // not an error: the cart explains what changed
    expect(lineOf("The Witcher 3: Wild Hunt").textContent).toContain("Price updated: €10.99 → €11.99");
    expect(lineOf("Hades").textContent).toContain("Only 1 left – quantity reduced");
    expect(cartStore.getSnapshot().map((l) => [l.offerId, l.quantity, l.priceCents])).toEqual([
      [15, 1, 1199],
      [27, 1, 1499],
    ]);

    await click(checkoutButton());
    const posts = orderPosts().map((p) => p.body as { idempotencyKey: string; items: CartLineInput[] });
    expect(posts[1].idempotencyKey).not.toBe(posts[0].idempotencyKey);
    expect(posts[1].items).toEqual([
      { offerId: 15, quantity: 1, expectedPriceCents: 1199 },
      { offerId: 27, quantity: 1, expectedPriceCents: 1499 },
    ]);
    expect(urlOf(router)).toBe(`/checkout/${ORDER_ID}`);
  });

  it("401 (the session ended meanwhile) is treated as signed out", async () => {
    server.user = me;
    fillCart(makeCartLine());
    server.handlers["POST /api/orders"] = () => {
      throw new ApiError("http", "HTTP 401", 401, { error: "Sign in required" });
    };
    const { router } = await mountApp("/cart");
    await click(checkoutButton());
    expect(urlOf(router)).toBe("/login?next=%2Fcart");
  });

  it("409 'Too many unpaid orders': the message with a link to /orders; the next press repeats the same attempt", async () => {
    server.user = me;
    fillCart(makeCartLine());
    let capReached = true;
    server.handlers["POST /api/orders"] = () => {
      if (capReached) throw new ApiError("http", "HTTP 409", 409, { error: "Too many unpaid orders – pay or cancel one first" });
      return { order: makeOrder() };
    };
    const { router } = await mountApp("/cart");

    await click(checkoutButton());
    expect(urlOf(router)).toBe("/cart");
    const alert = $("main [role=alert]")!;
    expect(alert.textContent).toBe("Too many unpaid orders – pay or cancel one first. View your orders");
    expect(alert.querySelector("a")?.getAttribute("href")).toBe("/orders");
    expect(cartStore.getSnapshot()).toHaveLength(1); // nothing changed in the cart

    // the user pays or cancels one order elsewhere, then presses Checkout again
    capReached = false;
    await click(checkoutButton());
    const keys = orderPosts().map((p) => (p.body as { idempotencyKey: string }).idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(urlOf(router)).toBe(`/checkout/${ORDER_ID}`);
  });

  it("the link of that message opens the orders page", async () => {
    server.user = me;
    fillCart(makeCartLine());
    server.handlers["POST /api/orders"] = () => {
      throw new ApiError("http", "HTTP 409", 409, { error: "Too many unpaid orders – pay or cancel one first" });
    };
    server.handlers["GET /api/orders"] = () => ({ orders: [] });
    const { router } = await mountApp("/cart");
    await click(checkoutButton());
    await click($<HTMLAnchorElement>("main [role=alert] a")!);
    expect(urlOf(router)).toBe("/orders");
  });
});
