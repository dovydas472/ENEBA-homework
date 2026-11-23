// @vitest-environment jsdom
// The orders list (/orders) and one order (/orders/:id) inside the real app routes, with apiFetch answered by an
// in-memory fake server: status badges, links, empty state, masked keys with Reveal / Copy, pending and 404.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../api/auth.ts";
import { ApiError, apiFetch } from "../api/client.ts";
import type { Order } from "../api/types.ts";
import { fakeAuthServer, newFakeAuthState, type FakeAuthState } from "../features/auth/fakeAuthServer.ts";
import { makeOrder, makePaidOrder, ORDER_ID, summaryOf } from "../features/checkout/fixtures.ts";
import { $, $$, click, flush, mountApp, resetCheckoutState, toastText, unmountApp, urlOf } from "../features/checkout/testApp.tsx";

vi.mock("../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client.ts")>()),
  apiFetch: vi.fn(),
}));

const me: User = { id: 7, email: "me@example.com", isDemo: false };
let server: FakeAuthState;
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  resetCheckoutState();
  server = newFakeAuthState();
  server.user = me;
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(fakeAuthServer(server));
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(unmountApp);

const OTHER_ID = "7c1d9e2a-0000-4000-8000-000000000001";
const EXPIRED_ID = "aa000000-0000-4000-8000-000000000002";
const CANCELLED_ID = "bb000000-0000-4000-8000-000000000003";

describe("/orders", () => {
  it("lists date, item count, total and a status badge; pending links to its payment page, others to the order", async () => {
    server.handlers["GET /api/orders"] = () => ({
      orders: [
        summaryOf(makeOrder()),
        summaryOf(makePaidOrder({ id: OTHER_ID })),
        summaryOf(makeOrder({ id: EXPIRED_ID, status: "expired" })),
        summaryOf(makeOrder({ id: CANCELLED_ID, status: "cancelled", totalCents: 1099 })),
      ],
    });
    await mountApp("/orders");
    expect($("main h1")?.textContent).toBe("My orders");

    const rows = $$<HTMLAnchorElement>("main li a");
    expect(rows.map((a) => a.getAttribute("href"))).toEqual([
      `/checkout/${ORDER_ID}`,
      `/orders/${OTHER_ID}`,
      `/orders/${EXPIRED_ID}`,
      `/orders/${CANCELLED_ID}`,
    ]);
    expect(rows.map((a) => a.querySelector("span[class*=badge]")?.textContent)).toEqual([
      "Pending payment",
      "Paid",
      "Expired",
      "Cancelled",
    ]);
    expect(rows[0].textContent).toContain("Order #0B9F2C1E");
    expect(rows[0].textContent).toContain("3 items");
    expect(rows[0].textContent).toContain("€40.97");
    expect(rows[0].textContent).toContain("Complete payment");
    expect(rows[0].textContent).toMatch(/22 Nov 2026, \d\d:00/); // local time of 12:00 UTC
    expect(rows[3].textContent).toContain("€10.99");
  });

  it("no orders: an empty state with 'Browse the store'", async () => {
    await mountApp("/orders");
    expect($("main h1")?.textContent).toBe("No orders yet");
    expect($("main a[href='/store']")?.textContent).toBe("Browse the store");
  });
});

describe("/orders/:id", () => {
  function answer(order: Order) {
    server.handlers[`GET /api/orders/${order.id}`] = () => ({ order, serverTime: "2026-11-22T12:05:00Z" });
  }
  const keyRows = () => $$("main ul[aria-label^='Keys for'] li");

  it("a paid order: every key masked, Reveal shows it (and Hide hides it again)", async () => {
    answer(makePaidOrder());
    await mountApp(`/orders/${ORDER_ID}`);
    expect($("main h1")?.textContent).toBe("Order #0B9F2C1E");
    expect($("main span[class*=badge]")?.textContent).toBe("Paid");
    expect(keyRows().map((li) => li.querySelector("code")?.firstChild?.textContent)).toEqual([
      "DEMO-••••-••••-••••",
      "DEMO-••••-••••-••••",
      "DEMO-••••-••••-••••",
    ]);
    expect($("main")?.textContent).not.toContain("DEMO-AB12");

    const reveal = $<HTMLButtonElement>("button[aria-label='Reveal key of The Witcher 3: Wild Hunt']")!;
    expect(reveal.getAttribute("aria-pressed")).toBe("false");
    await click(reveal);
    expect(keyRows()[0].querySelector("code")?.textContent).toBe("DEMO-AB12-CD34-EF56");
    expect(reveal.getAttribute("aria-pressed")).toBe("true");
    expect(keyRows()[1].querySelector("code")?.firstChild?.textContent).toBe("DEMO-••••-••••-••••"); // only that one

    await click($<HTMLButtonElement>("button[aria-label='Hide key of The Witcher 3: Wild Hunt']")!);
    expect(keyRows()[0].querySelector("code")?.firstChild?.textContent).toBe("DEMO-••••-••••-••••");
  });

  it("Copy puts the REAL key on the clipboard (no reveal needed) and says 'Copied'", async () => {
    answer(makePaidOrder());
    await mountApp(`/orders/${ORDER_ID}`);
    await click($<HTMLButtonElement>("button[aria-label='Copy key 2 of Hades']")!);
    expect(writeText).toHaveBeenCalledWith("DEMO-NP34-QR56-ST78");
    await flush();
    expect(toastText()).toBe("Copied");
  });

  it("a refused clipboard tells the user how to copy by hand", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    answer(makePaidOrder());
    await mountApp(`/orders/${ORDER_ID}`);
    await click($<HTMLButtonElement>("button[aria-label='Copy key of The Witcher 3: Wild Hunt']")!);
    await flush();
    expect(toastText()).toBe("Could not copy. Reveal the key and copy it by hand.");
  });

  it("a pending order: no keys, 'Complete payment' links to its payment page", async () => {
    answer(makeOrder());
    const { router } = await mountApp(`/orders/${ORDER_ID}`);
    expect($("main span[class*=badge]")?.textContent).toBe("Pending payment");
    expect(keyRows()).toEqual([]);
    const pay = $<HTMLAnchorElement>(`main a[href='/checkout/${ORDER_ID}']`)!;
    expect(pay.textContent).toBe("Complete payment");
    server.handlers[`GET /api/orders/${ORDER_ID}`] = () => ({ order: makeOrder(), serverTime: "2026-11-22T12:05:00Z" });
    await click(pay);
    expect(urlOf(router)).toBe(`/checkout/${ORDER_ID}`);
  });

  it("an expired order explains why there are no keys", async () => {
    answer(makeOrder({ status: "expired" }));
    await mountApp(`/orders/${ORDER_ID}`);
    expect($("main span[class*=badge]")?.textContent).toBe("Expired");
    expect($("main")?.textContent).toContain("The 15-minute reservation ended before payment.");
    expect($(`main a[href='/checkout/${ORDER_ID}']`)).toBeNull();
  });

  it("unknown or another user's order: the 404 page", async () => {
    server.handlers[`GET /api/orders/${OTHER_ID}`] = () => {
      throw new ApiError("http", "HTTP 404", 404, { error: "Not found" });
    };
    await mountApp(`/orders/${OTHER_ID}`);
    expect($("main h1")?.textContent).toBe("Page not found");
  });
});
