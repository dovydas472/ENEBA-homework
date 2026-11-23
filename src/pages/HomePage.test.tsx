// @vitest-environment jsdom
// The home page in an in-memory router, with apiFetch replaced by a fake server (no network). It checks that the
// page is built ONLY from what the server sends, and that the blocks fail independently.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../api/client.ts";
import { discounts, homeResponses, makeSlide, registry, tiles } from "../features/home/fixtures.ts";
import { HERO_PHONE_MEDIA, HERO_SIZES } from "../features/home/heroImage.ts";
import { render } from "../test-utils.tsx";
import { HomePage } from "./HomePage.tsx";

vi.mock("../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client.ts")>()),
  apiFetch: vi.fn(),
}));

const fakeApi = vi.mocked(apiFetch);
const requested = () => fakeApi.mock.calls.map((call) => call[0]);
/** What the fake server answers, per path. A missing path or an Error value = HTTP 500. */
let responses: Record<string, unknown>;

beforeEach(() => {
  responses = { ...homeResponses };
  fakeApi.mockReset();
  fakeApi.mockImplementation(async (path: string) => {
    const answer = responses[path];
    if (answer === undefined || answer instanceof Error) throw new ApiError("http", "HTTP 500", 500);
    return structuredClone(answer) as never;
  });
});

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
});

const settle = async () => {
  for (let tick = 0; tick < 6; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const flush = () => act(settle);

async function mount() {
  const router = createMemoryRouter(
    [
      { path: "/", Component: HomePage },
      { path: "/store", element: <p>store page</p> },
      { path: "/product/:slug", element: <p>product page</p> },
    ],
    { initialEntries: ["/"] },
  );
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
const $$ = <T extends Element = HTMLElement>(selector: string) => [...document.querySelectorAll<T>(selector)];
const blockTypes = () => $$("[data-block-type]").map((el) => el.dataset.blockType);
const hrefs = (root: ParentNode) => [...root.querySelectorAll("a")].map((a) => a.getAttribute("href"));

describe("HomePage: a page assembled from server blocks", () => {
  it("asks for the registry, then each block from its own endpoint, and draws them in the registry's order", async () => {
    await mount();
    expect(requested()).toEqual(
      expect.arrayContaining(["/api/homepage", "/api/blocks/hero", "/api/blocks/tiles", "/api/blocks/platforms", "/api/blocks/products/discounts"]),
    );
    expect(blockTypes()).toEqual(["hero", "tiles", "platforms", "product_row"]);
    expect($("main h1, h1")?.textContent).toBe("EneHomeworkBa – game keys");
  });

  it("follows the registry: another order and other titles change the page, with no frontend change", async () => {
    responses["/api/homepage"] = {
      blocks: [
        { key: "discounts", type: "product_row", title: "Deals of the week", endpoint: "/api/blocks/products/discounts" },
        registry.blocks[0],
      ],
    };
    await mount();
    expect(blockTypes()).toEqual(["product_row", "hero"]);
    expect($("[data-block-type=product_row] h2")?.textContent).toBe("Deals of the week");
    expect(requested()).not.toContain("/api/blocks/tiles"); // a block that is not listed is not loaded at all
  });

  it("skips a block type it does not know - no request, no error, the other blocks still render", async () => {
    responses["/api/homepage"] = {
      blocks: [...registry.blocks, { key: "videos", type: "video_wall", title: "Videos", endpoint: "/api/blocks/videos" }],
    };
    await mount();
    expect(blockTypes()).toEqual(["hero", "tiles", "platforms", "product_row"]);
    expect(requested()).not.toContain("/api/blocks/videos");
    expect($("[role=alert]")).toBeNull();
  });

  it("one failing block shows its own small error with Retry; the others render; Retry loads it", async () => {
    responses["/api/blocks/tiles"] = new Error("down");
    await mount();

    const alert = $("[data-block-type=tiles] [role=alert]");
    expect(alert?.textContent).toContain("“Shortcuts” could not be loaded.");
    expect($$("[role=alert]")).toHaveLength(1); // only that block
    expect($("[data-block-type=hero] h2")?.textContent).toBe("INNERT");
    expect($$("[data-block-type=product_row] li h3").map((h) => h.textContent)).toEqual(["God of War", "Tomb Raider"]);

    responses["/api/blocks/tiles"] = tiles;
    await act(async () => {
      alert!.querySelector("button")!.click();
      await settle();
    });
    expect($("[data-block-type=tiles] [role=alert]")).toBeNull();
    expect(hrefs($("[data-block-type=tiles]")!)).toEqual(["/store?sort=discount", "/store?platform=steam", "/store?sort=newest"]);
  });

  it("a block that crashes while drawing (unexpected data) hides itself; the page stays", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    responses["/api/blocks/hero"] = { unexpected: true }; // no `slides`: the renderer throws
    await mount();
    expect($("[data-block-type=hero]")?.textContent).toBe("");
    expect(blockTypes()).toEqual(["hero", "tiles", "platforms", "product_row"]);
    expect($$("[data-block-type=product_row] li h3")).toHaveLength(2);
    expect(consoleError).toHaveBeenCalled();
  });

  it("if the registry itself fails, the page shows an error with Retry", async () => {
    responses["/api/homepage"] = new Error("down");
    await mount();
    expect($("[role=alert]")?.textContent).toContain("The home page could not be loaded.");
    expect(blockTypes()).toEqual([]);

    responses["/api/homepage"] = registry;
    await act(async () => {
      $("[role=alert] button")!.click();
      await settle();
    });
    expect(blockTypes()).toEqual(["hero", "tiles", "platforms", "product_row"]);
  });

  it("an empty registry shows a friendly empty state with a link to the Store", async () => {
    responses["/api/homepage"] = { blocks: [] };
    await mount();
    expect($("main a[href='/store'], a[href='/store']")?.textContent).toBe("Browse the store");
  });
});

describe("HomePage: block links", () => {
  it("side tiles link into the Store; an unknown accent still draws a tile", async () => {
    await mount();
    const tilesBlock = $("[data-block-type=tiles]")!;
    expect(tilesBlock.querySelector("section")?.getAttribute("aria-label")).toBe("Shortcuts");
    expect(hrefs(tilesBlock)).toEqual(["/store?sort=discount", "/store?platform=steam", "/store?sort=newest"]);
    expect(tilesBlock.querySelectorAll("a")[0].textContent).toBe("Up to −70%The biggest discounts");
    // The covers are decoration: no alt text, hidden from screen readers.
    const covers = [...tilesBlock.querySelectorAll("img")];
    expect(covers.map((img) => img.getAttribute("src"))).toEqual(["https://img/a.jpg", "https://img/b.jpg"]);
    expect(covers.every((img) => img.getAttribute("alt") === "" && img.closest("[aria-hidden=true]"))).toBe(true);
  });

  it("the platform row links every platform to the filtered Store, with its count; an unknown icon gets the default", async () => {
    const { router } = await mount();
    const nav = $("nav[aria-label='Browse by platform']")!;
    expect(hrefs(nav)).toEqual(["/store", "/store?platform=steam", "/store?platform=epic-games"]);
    expect([...nav.querySelectorAll("a")].map((a) => a.textContent)).toEqual([
      "All games108 products",
      "Steam54 products",
      "Epic Games1 product",
    ]);
    expect(nav.querySelectorAll("a svg")).toHaveLength(3);

    await act(async () => {
      nav.querySelectorAll("a")[1].click();
      await settle();
    });
    expect(router.state.location.pathname + router.state.location.search).toBe("/store?platform=steam");
  });

  it("a product row shows the Store's cards and 'View all' to its Store URL", async () => {
    await mount();
    const row = $("[data-block-type=product_row]")!;
    expect(row.querySelector("h2")?.textContent).toBe("Biggest discounts");
    expect(row.querySelectorAll("li")).toHaveLength(discounts.items.length);
    // The Store card, including its Add to cart button.
    expect(row.querySelector("a[href='/product/god-of-war-steam-global']")).not.toBeNull();
    expect([...row.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Add to cart"))).toBe(true);
    const viewAll = row.querySelector<HTMLAnchorElement>("a[href='/store?sort=discount']");
    expect(viewAll?.textContent).toBe("View all: Biggest discounts"); // the hidden part tells the three apart
  });
});

describe("HomePage: early hero picture (Task 17, LCP)", () => {
  const preloadLinks = () => $$<HTMLLinkElement>("head link[rel=preload][as=image]");
  afterEach(() => preloadLinks().forEach((link) => link.remove()));

  it("preloads the picture the registry names, before the hero block has answered", async () => {
    const image = makeSlide().image;
    responses["/api/homepage"] = { ...registry, preload: { heroImage: image } };
    // The hero block never answers: the picture must not wait for it.
    fakeApi.mockImplementation(async (path: string) => {
      if (path === "/api/blocks/hero") return new Promise(() => {}) as never;
      const answer = responses[path];
      if (answer === undefined || answer instanceof Error) throw new ApiError("http", "HTTP 500", 500);
      return structuredClone(answer) as never;
    });
    await mount();
    expect($("section[aria-roledescription=carousel]")).toBeNull(); // the hero is still loading
    const links = preloadLinks();
    expect(links).toHaveLength(1);
    // jsdom has no matchMedia: the desktop crop, with the same sizes as the carousel's <img>.
    expect(links[0].getAttribute("imagesrcset")).toBe(image.srcset);
    expect(links[0].getAttribute("imagesizes")).toBe(HERO_SIZES);
    expect(links[0].getAttribute("fetchpriority")).toBe("high");
    // ...and the hero's placeholder already SHOWS that picture (same srcset, so the preloaded file is the one drawn).
    const placeholder = $("[data-block-type=hero] img");
    expect(placeholder?.getAttribute("srcset")).toBe(image.srcset);
    expect(placeholder?.getAttribute("fetchpriority")).toBe("high");
  });

  it("without a hint the hero placeholder is the plain skeleton", async () => {
    fakeApi.mockImplementation(async (path: string) => {
      if (path === "/api/blocks/hero") return new Promise(() => {}) as never;
      return structuredClone(responses[path]) as never;
    });
    await mount();
    expect($("[data-block-type=hero] img")).toBeNull();
    expect($("[data-block-type=hero] [aria-hidden=true]")).not.toBeNull();
  });

  it("on a phone preloads the phone crop", async () => {
    window.matchMedia = vi.fn((query: string) => ({ matches: query === HERO_PHONE_MEDIA })) as never;
    const image = makeSlide().image;
    responses["/api/homepage"] = { ...registry, preload: { heroImage: image } };
    await mount();
    const links = preloadLinks();
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("imagesrcset")).toBe(image.mobileSrcset);
    expect(links[0].getAttribute("imagesizes")).toBe("100vw");
    // @ts-expect-error -- jsdom has no matchMedia; remove the fake again
    delete window.matchMedia;
  });

  it("no hint (no hero, or an older server) -> no preload", async () => {
    responses["/api/homepage"] = { ...registry, preload: { heroImage: null } };
    await mount();
    expect(preloadLinks()).toHaveLength(0);
  });
});
