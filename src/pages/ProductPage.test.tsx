// @vitest-environment jsdom
// The product page inside the REAL app routes (layout, header with the cart badge, toaster), with apiFetch
// replaced by a fake: no server, no network. The cart is the real store on jsdom's localStorage.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../api/client.ts";
import type { ProductDetail } from "../api/types.ts";
import { loadAllPages } from "../app/lazyPages.ts";
import { routes } from "../app/routes.ts";
import { CART_STORAGE_KEY } from "../features/cart/cart.ts";
import { cartStore } from "../features/cart/cartStore.ts";
import { makeDetail, makeOutOfStockDetail } from "../features/product/fixtures.ts";
import { render } from "../test-utils.tsx";

vi.mock("../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client.ts")>()),
  apiFetch: vi.fn(),
}));
// The header asks who is signed in (Task 14). These tests are about the product page: nobody is, and that
// question never reaches the fake apiFetch, so the product requests can be counted exactly.
vi.mock("../api/auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/auth.ts")>()),
  getCurrentUser: vi.fn(async () => null),
}));

const fakeApi = vi.mocked(apiFetch);
const witcherUrl = "/product/the-witcher-3-wild-hunt-steam-global";
let cleanup: (() => void) | undefined;

/** The fake API answers `detail` for every product request. */
function answerWith(detail: ProductDetail) {
  fakeApi.mockImplementation(async () => detail as never);
}

// Task 17: the lazily loaded pages (lazyPages.ts) are loaded once up front, so no test waits for a module mid-render.
beforeAll(() => loadAllPages());
beforeEach(() => {
  window.scrollTo = vi.fn() as never; // jsdom has no scrolling; the layout's ScrollRestoration calls it
  fakeApi.mockReset();
  answerWith(makeDetail());
  cartStore.clear();
});
afterEach(() => cleanup?.());

// TanStack Query hands its result to React through a timer: wait a few ticks.
const settle = async () => {
  for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const flush = () => act(settle);

async function mount(url = witcherUrl) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
  await flush();
  return { router };
}

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const main = () => $("main")!;
const buyBox = () => $("section[aria-labelledby=buy-box-label]")!;
const offerRows = () => $$("#offers li");
const buttonIn = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith(text))!;
const click = (element: HTMLElement) => act(() => element.click());
const cartLink = () => $("header a[href='/cart']")!;
const toast = () => $("[role=status] p")?.textContent;

describe("ProductPage: content", () => {
  it("shows the title, breadcrumb, cover, platform and region; tab title '{title} ({platform} · {region}) – EneHomeworkBa'", async () => {
    await mount();
    expect($$("main h1").map((h) => h.textContent)).toEqual(["The Witcher 3: Wild Hunt"]);
    // Task 17: platform and region in the title, so every version of a game has its own tab title.
    expect(document.title).toBe("The Witcher 3: Wild Hunt (Steam · GLOBAL) – EneHomeworkBa");

    const crumbs = $("nav[aria-label=Breadcrumb]")!;
    expect(crumbs.querySelector("a")?.getAttribute("href")).toBe("/store");
    expect(crumbs.querySelector("[aria-current=page]")?.textContent).toBe("The Witcher 3: Wild Hunt");

    expect($<HTMLImageElement>("main img")?.src).toBe("https://images.example/witcher.jpg");
    expect(main().textContent).toContain("GLOBAL");
    expect(main().textContent).toContain("Activate / redeem on Steam");
  });

  it("asks the API for this slug (through the shared productQuery)", async () => {
    await mount();
    expect(fakeApi.mock.calls[0][0]).toBe("/api/products/the-witcher-3-wild-hunt-steam-global");
  });

  it("shows the edition only when it is not 'Standard'", async () => {
    await mount();
    expect($("main h1")!.parentElement!.textContent).not.toContain("Standard");
    cleanup?.();

    const goty = makeDetail();
    answerWith({ ...goty, product: { ...goty.product, edition: "Game of the Year Edition" } });
    await mount();
    expect($("main h1")!.parentElement!.textContent).toContain("Game of the Year Edition");
  });

  it("buy box: the cheapest offer with MSRP struck through, -NN%, seller and rating label", async () => {
    await mount();
    const box = buyBox();
    expect(box.textContent).toContain("€10.99");
    expect(box.querySelector("s")?.textContent).toContain("€39.99");
    expect(box.textContent).toContain("-72%"); // (3999 - 1099) * 100 / 3999 = 72.5 -> 72
    expect(box.textContent).toContain("Sold by Retro Ridge");
    expect(box.textContent).toContain("7.38");
    expect(buttonIn(box, "Add to cart")).toBeDefined();
    expect(box.querySelector("a[href='#offers']")?.textContent).toBe("+3 more offers");
  });

  it("lists every offer, the cheapest marked 'Best price'", async () => {
    await mount();
    expect($("#offers h2")?.textContent).toBe("4 offers");
    const rows = offerRows();
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual([
      "Retro RidgeBest price",
      "Quest Depot",
      "Fresh Start Keys",
      "Keystone Kiosk",
    ]);
  });

  it("seller rating: 'Excellent 9.63' with the reviews count, or 'New seller'", async () => {
    await mount();
    const [, quest, fresh, kiosk] = offerRows();
    expect(kiosk.textContent).toContain("Excellent 9.63");
    expect(kiosk.textContent).toContain("(9,875 reviews)");
    expect(quest.textContent).toContain("Good 8.46");
    expect(fresh.textContent).toContain("New seller");
    expect(fresh.textContent).not.toContain("review");
  });

  it("'Only N left' when the stock is 3 or less", async () => {
    await mount();
    const [retro, quest, fresh, kiosk] = offerRows();
    expect(retro.textContent).not.toContain("left"); // stock 6
    expect(quest.textContent).toContain("Only 3 left");
    expect(fresh.textContent).not.toContain("left"); // stock 4
    expect(kiosk.textContent).toContain("Only 2 left");
  });

  it("other versions link to their own pages, with a price or 'Out of stock'", async () => {
    const { router } = await mount();
    const links = $$("section[aria-labelledby=variants-title] a");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/product/the-witcher-3-wild-hunt-game-of-the-year-edition-steam-global",
      "/product/the-witcher-3-wild-hunt-psn-europe",
    ]);
    expect(links[0].textContent).toContain("Game of the Year Edition");
    expect(links[0].textContent).toContain("€29.99");
    expect(links[1].textContent).toContain("Out of stock");

    click(links[0]);
    await flush();
    expect(router.state.location.pathname).toBe("/product/the-witcher-3-wild-hunt-game-of-the-year-edition-steam-global");
  });

  it("details: genres, description, release date, developer; unknown publisher left out", async () => {
    await mount();
    expect($$("ul[aria-label=Genres] li").map((li) => li.textContent)).toEqual(["Role-playing (RPG)", "Adventure"]);
    expect(main().textContent).toContain("Geralt of Rivia hunts monsters.");
    const details = $$("dl dt").map((dt) => `${dt.textContent}: ${dt.nextElementSibling?.textContent}`);
    expect(details).toEqual([
      "Release date: 19 May 2015",
      "Developer: CD Projekt RED",
      "Platform: Steam",
      "Region: GLOBAL",
      "Edition: Standard",
    ]);
  });
});

describe("ProductPage: out of stock, 404, errors, loading", () => {
  it("out of stock: an 'Out of stock' box with links to the in-stock versions; no offers, no cart buttons", async () => {
    answerWith(makeOutOfStockDetail());
    await mount();
    const box = $("section[aria-labelledby=out-of-stock-title]")!;
    expect(box.querySelector("h2")?.textContent).toBe("Out of stock");
    // Only the GOTY version is in stock; the PSN one is not offered as an alternative.
    expect([...box.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/product/the-witcher-3-wild-hunt-game-of-the-year-edition-steam-global",
    ]);
    expect(box.textContent).toContain("€29.99");
    expect($("#offers")).toBeNull();
    expect($$("main button").filter((b) => b.textContent?.startsWith("Add to cart"))).toHaveLength(0);
  });

  it("out of stock without any in-stock version: a link back to the store", async () => {
    const detail = makeOutOfStockDetail();
    answerWith({ ...detail, variants: [] });
    await mount();
    const box = $("section[aria-labelledby=out-of-stock-title]")!;
    expect(box.querySelector("a")?.getAttribute("href")).toBe("/store");
    expect(box.querySelector("a")?.textContent).toBe("Browse the store");
  });

  it("an unknown slug shows the 404 page inside the layout", async () => {
    fakeApi.mockImplementation(async () => {
      throw new ApiError("http", "HTTP 404", 404, { error: "product not found" });
    });
    await mount("/product/no-such-product");
    expect($("main h1")?.textContent).toBe("Page not found");
    expect(document.title).toBe("Page not found – EneHomeworkBa");
    expect($("header")).not.toBeNull();
  });

  it("an API error shows ErrorState; Retry asks again and shows the page", async () => {
    fakeApi.mockImplementationOnce(async () => {
      throw new ApiError("http", "HTTP 503", 503);
    });
    await mount();
    expect($("[role=alert]")?.textContent).toContain("Something went wrong");
    expect($("[role=alert]")?.textContent).not.toContain("503"); // never the raw error

    click(buttonIn(document, "Retry"));
    await flush();
    expect($("main h1")?.textContent).toBe("The Witcher 3: Wild Hunt");
    expect(fakeApi).toHaveBeenCalledTimes(2);
  });

  it("shows the skeleton while loading", async () => {
    let finish!: (value: ProductDetail) => void;
    fakeApi.mockImplementation(() => new Promise((resolve) => (finish = resolve as never)));
    await mount();
    expect($("main [aria-busy=true]")).not.toBeNull();
    expect($("main h1")).toBeNull();
    expect(document.title).toBe("Product – EneHomeworkBa");

    await act(async () => {
      finish(makeDetail());
      await settle();
    });
    expect($("main [aria-busy=true]")).toBeNull();
    expect($("main h1")?.textContent).toBe("The Witcher 3: Wild Hunt");
  });
});

describe("ProductPage: add to cart", () => {
  it("updates the header badge, saves the cart and shows the 'Added to cart' toast with 'View cart'", async () => {
    const { router } = await mount();
    expect(cartLink().getAttribute("aria-label")).toBe("Cart, 0 items");

    click(buttonIn(buyBox(), "Add to cart"));
    expect(cartLink().getAttribute("aria-label")).toBe("Cart, 1 item");
    expect(cartLink().textContent).toBe("1");
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY)!)).toEqual([
      expect.objectContaining({ offerId: 15, quantity: 1, sellerName: "Retro Ridge", priceCents: 1099, title: "The Witcher 3: Wild Hunt" }),
    ]);
    expect(toast()).toBe("Added to cart");

    const viewCart = $<HTMLAnchorElement>("[role=status] a")!;
    expect(viewCart.textContent).toBe("View cart");
    click(viewCart);
    await flush();
    expect(router.state.location.pathname).toBe("/cart");
    expect(toast()).toBeUndefined(); // following the link closes the toast
  });

  it("each offer row adds ITS offer: another seller is another cart line", async () => {
    await mount();
    const [retro, quest] = offerRows();
    click(buttonIn(retro, "Add to cart"));
    click(buttonIn(quest, "Add to cart"));
    expect(cartStore.getSnapshot().map((line) => [line.offerId, line.sellerName])).toEqual([
      [15, "Retro Ridge"],
      [16, "Quest Depot"],
    ]);
    expect(cartLink().getAttribute("aria-label")).toBe("Cart, 2 items");
  });

  it("stops at the stock and says 'Maximum quantity reached'", async () => {
    await mount();
    const kiosk = offerRows()[3]; // stock 2
    click(buttonIn(kiosk, "Add to cart"));
    click(buttonIn(kiosk, "Add to cart"));
    expect(toast()).toBe("Added to cart");
    click(buttonIn(kiosk, "Add to cart"));
    expect(toast()).toBe("Maximum quantity reached");
    expect(cartStore.getSnapshot()[0].quantity).toBe(2);
  });

  it("the offer button names its seller for screen readers", async () => {
    await mount();
    expect(buttonIn(offerRows()[1], "Add to cart").textContent).toBe("Add to cart from Quest Depot");
  });
});
