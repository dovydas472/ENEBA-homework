// What a link target prefetches (planPrefetch) and that prefetchRoute asks each thing only once while it is fresh,
// skips the orders for a signed-out visitor, and does nothing at all with Data Saver on.
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "../api/queries.ts";
import { pageLoaders } from "./lazyPages.ts";
import { planPrefetch, prefetchRoute } from "./prefetch.ts";

describe("planPrefetch", () => {
  it.each([
    ["/product/the-witcher-3", { data: { kind: "product", slug: "the-witcher-3" } }],
    ["/store", { data: { kind: "products", params: {} } }],
    ["/store?platform=steam,psn&sort=price_asc&page=2", { data: { kind: "products", params: { platform: ["steam", "psn"], sort: "price_asc", page: 2 } } }],
    ["/orders", { page: "orders", data: { kind: "orders" } }],
    ["/orders/0b9f2c1e", { page: "order" }],
    ["/checkout/0b9f2c1e", { page: "checkout" }],
    ["/cart", { page: "cart" }],
    ["/login?next=%2Fcart", { page: "login" }],
    ["/register", { page: "register" }],
  ])("%s -> %j", (to, plan) => {
    expect(planPrefetch(to)).toEqual(plan);
  });

  it("reads the Store URL with the Store page's own sanitizer: invalid values are dropped, as on the page", () => {
    // page=0 is out of range, sort=bogus is unknown, an inverted price range is ignored, unknown keys do not exist.
    expect(planPrefetch("/store?page=0&sort=bogus&minPrice=900&maxPrice=100&utm=x&region=eu")).toEqual({
      data: { kind: "products", params: { region: ["eu"] } },
    });
  });

  it("accepts a router object target too", () => {
    expect(planPrefetch({ pathname: "/store", search: "?q=witcher" })).toEqual({ data: { kind: "products", params: { q: "witcher" } } });
  });

  it.each(["/", "/nope/not/here", "https://example.com/product/x", "//example.com/store", "product/x", "#main"])(
    "%s -> nothing",
    (to) => {
      expect(planPrefetch(to)).toBeNull();
    },
  );
});

describe("prefetchRoute", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const requested = () => fetchMock.mock.calls.map((call) => call[0]);
  /** The same freshness rule as the app (queryClient.ts): no retries in tests. */
  const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
  /** prefetchQuery hands its answer over through promises: wait for them. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    fetchMock = vi.fn(async (path: string) =>
      new Response(path === "/api/orders" ? '{"orders":[]}' : "{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a product link asks for that product once; again within the fresh time costs nothing", async () => {
    const client = newClient();
    prefetchRoute(client, "/product/the-witcher-3");
    prefetchRoute(client, "/product/the-witcher-3"); // still on its way: shared
    await settle();
    prefetchRoute(client, "/product/the-witcher-3"); // answered and fresh: not asked again
    await settle();
    expect(requested()).toEqual(["/api/products/the-witcher-3"]);
    expect(client.getQueryData(queryKeys.product("the-witcher-3"))).toEqual({});
  });

  it("a Store link fills the SAME cache entry the Store page reads (sanitized params as the key)", async () => {
    const client = newClient();
    prefetchRoute(client, "/store?platform=steam&page=0");
    await settle();
    expect(requested()).toEqual(["/api/products?platform=steam"]);
    expect(client.getQueryData(queryKeys.productList({ platform: ["steam"] }))).toEqual({});
  });

  it("orders: signed out -> only the page code, no request (it would be a 401)", async () => {
    const load = vi.spyOn(pageLoaders, "orders");
    const client = newClient();
    client.setQueryData(queryKeys.currentUser, null);
    prefetchRoute(client, "/orders");
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(requested()).toEqual([]);
  });

  it("orders: signed in -> the page code and the order list", async () => {
    const load = vi.spyOn(pageLoaders, "orders");
    const client = newClient();
    client.setQueryData(queryKeys.currentUser, { id: 1, email: "a@example.com", isDemo: false });
    prefetchRoute(client, "/orders");
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(requested()).toEqual(["/api/orders"]);
  });

  it("a code-only page (the cart) loads its chunk and sends no request", async () => {
    const load = vi.spyOn(pageLoaders, "cart");
    prefetchRoute(newClient(), "/cart");
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(requested()).toEqual([]);
  });

  it("with Data Saver on, nothing is fetched early", async () => {
    vi.stubGlobal("navigator", { ...navigator, connection: { saveData: true } });
    const load = vi.spyOn(pageLoaders, "cart");
    const client = newClient();
    prefetchRoute(client, "/product/the-witcher-3");
    prefetchRoute(client, "/cart");
    await settle();
    expect(requested()).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it("a failing prefetch is silent (no throw, no unhandled rejection); the page asks again itself", async () => {
    fetchMock.mockImplementation(async () => new Response('{"error":"x"}', { status: 500 }));
    const client = newClient();
    expect(() => prefetchRoute(client, "/product/x")).not.toThrow();
    await settle();
    expect(client.getQueryState(queryKeys.product("x"))?.status).toBe("error");
  });
});
