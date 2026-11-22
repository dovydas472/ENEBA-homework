// @vitest-environment jsdom
// The Store page in an in-memory router, with apiFetch replaced by a fake (no server, no network).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../api/client.ts";
import type { ProductsResponse } from "../api/types.ts";
import { facets, makeItem, makeResponse } from "../features/store/fixtures.ts";
import { fire, polyfillDialog, render, setControlValue } from "../test-utils.tsx";
import { StorePage } from "./StorePage.tsx";

vi.mock("../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client.ts")>()),
  apiFetch: vi.fn(),
}));

const fakeApi = vi.mocked(apiFetch);
const witcher = makeItem();
const gta = makeItem({ slug: "gta-v-steam-global", title: "Grand Theft Auto V", edition: "Premium Edition" });
const requested = () => fakeApi.mock.calls.map((call) => call[0]);

let cleanup: (() => void) | undefined;
let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeApi.mockReset();
  fakeApi.mockImplementation(async () => makeResponse([witcher, gta]) as never);
  // jsdom has no layout: scrollIntoView does not exist, and <dialog> has no showModal/close.
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as never;
  polyfillDialog();
});
afterEach(() => cleanup?.());

/** Mounts the page at `url`, with the home page ("/") one step back in the history. Retries are off so an error shows at once. */
async function mount(url = "/store") {
  const router = createMemoryRouter(
    [
      { path: "/", element: <p>home</p> },
      { path: "/store", Component: StorePage },
      { path: "/product/:slug", element: <p>product page</p> },
    ],
    { initialEntries: ["/", url], initialIndex: 1 },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
  await flush();
  return { ...view, router, queryClient };
}

/** Lets pending promises (the fake API, TanStack Query) finish and React re-render. */
// TanStack Query hands its result to React through a timer that is only created AFTER the fake API answered,
// so one tick is not enough: wait a few.
const settle = async () => {
  for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const flush = () => act(settle);
/** Answers a request that the test is holding back, then lets the page update. */
const answer = (finish: (value: ProductsResponse) => void, value: ProductsResponse) =>
  act(async () => {
    finish(value);
    await settle();
  });

const urlOf = (router: Awaited<ReturnType<typeof mount>>["router"]) => router.state.location.pathname + router.state.location.search;
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const sidebar = () => $("aside[aria-label=Filters]");
const checkbox = (name: string, root: ParentNode = sidebar()) =>
  [...root.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].find((input) => input.closest("label")?.textContent?.includes(name))!;
const button = (text: string) => $$("button").find((b) => b.textContent?.trim() === text)!;
const click = (element: HTMLElement) => act(() => element.click());

describe("StorePage: results", () => {
  it("renders the products with their facets and the result count", async () => {
    await mount();
    expect($$("li h3").map((h) => h.textContent)).toEqual(["The Witcher 3: Wild Hunt", "Grand Theft Auto V"]);
    expect($("[aria-live=polite]").textContent).toBe("2 results");
    // Facet counts next to the names, in the sidebar.
    expect(checkbox("Steam").closest("label")?.textContent).toBe("Steam54");
    expect(checkbox("PlayStation Network").closest("label")?.textContent).toBe("PlayStation Network17");
    expect(checkbox("Europe").closest("label")?.textContent).toBe("Europe22");
    // The price boxes get their placeholders from facets.priceRange.
    expect($<HTMLInputElement>("[aria-label='Minimum price in euros']").placeholder).toBe("5.49");
  });

  it("says '1 result' for a single result", async () => {
    fakeApi.mockImplementation(async () => makeResponse([witcher]) as never);
    await mount();
    expect($("[aria-live=polite]").textContent).toBe("1 result");
  });

  it("asks the API with no parameters for a plain /store", async () => {
    await mount();
    expect(requested()).toEqual(["/api/products"]);
  });

  it("sets the tab title and has one h1", async () => {
    await mount();
    expect(document.title).toBe("Store – EneHomeworkBa");
    expect($$("h1")).toHaveLength(1);
  });

  it("every card links to its product page", async () => {
    const { router } = await mount();
    click($("a[href='/product/gta-v-steam-global']"));
    await flush();
    expect(urlOf(router)).toBe("/product/gta-v-steam-global");
  });
});

describe("StorePage: loading", () => {
  it("shows skeleton cards on the first load, then the products", async () => {
    let finish!: (value: ProductsResponse) => void;
    fakeApi.mockImplementation(() => new Promise((resolve) => (finish = resolve as never)));
    await mount();
    expect($("ul[aria-busy=true]")).not.toBeNull();
    expect($$("li h3")).toHaveLength(0);

    await answer(finish, makeResponse([witcher]));
    expect($("ul[aria-busy=true]")).toBeNull();
    expect($$("li h3")).toHaveLength(1);
  });

  it("keeps the old results (dimmed, busy) while a filter change loads, then swaps them", async () => {
    await mount();
    let finish!: (value: ProductsResponse) => void;
    fakeApi.mockImplementation(() => new Promise((resolve) => (finish = resolve as never)));

    click(checkbox("PlayStation Network"));
    await flush();
    // The new request is running, but the old cards are still there, marked busy.
    expect($$("li h3").map((h) => h.textContent)).toContain("The Witcher 3: Wild Hunt");
    expect($("ul[aria-busy=true]")).not.toBeNull();
    expect(document.body.textContent).toContain("Updating results");

    await answer(finish, makeResponse([gta]));
    expect($$("li h3").map((h) => h.textContent)).toEqual(["Grand Theft Auto V"]);
    expect($("ul[aria-busy=true]")).toBeNull();
    expect(document.body.textContent).not.toContain("Updating results");
  });
});

describe("StorePage: filters live in the URL", () => {
  it("clicking a platform updates the URL and the request, and resets the page to 1", async () => {
    const { router } = await mount("/store?page=2&sort=title");
    click(checkbox("Steam"));
    await flush();
    expect(urlOf(router)).toBe("/store?platform=steam&sort=title"); // page is gone
    expect(requested().at(-1)).toBe("/api/products?platform=steam&sort=title");
  });

  it("ticks the boxes that the URL says and shows them as chips", async () => {
    await mount("/store?platform=steam,psn&region=europe");
    expect(checkbox("Steam").checked).toBe(true);
    expect(checkbox("PlayStation Network").checked).toBe(true);
    expect(checkbox("Europe").checked).toBe(true);
    expect(checkbox("Global").checked).toBe(false);
    expect($$("ul[aria-label='Active filters'] li").map((li) => li.textContent)).toEqual([
      "Steam",
      "PlayStation Network",
      "Europe",
      "Clear all",
    ]);
  });

  it("unticking removes the platform from the URL", async () => {
    const { router } = await mount("/store?platform=steam,psn");
    click(checkbox("Steam"));
    await flush();
    expect(urlOf(router)).toBe("/store?platform=psn");
  });

  it("the × of a chip removes only that filter", async () => {
    const { router } = await mount("/store?platform=steam,psn&sort=title");
    click($("button[aria-label='Remove filter: platform Steam']"));
    await flush();
    expect(urlOf(router)).toBe("/store?platform=psn&sort=title");
  });

  it("'Clear all' removes every filter but keeps the sort and the search text", async () => {
    const { router } = await mount("/store?q=zelda&platform=steam&region=europe&minPrice=500&sort=title");
    click(button("Clear all"));
    await flush();
    expect(urlOf(router)).toBe("/store?q=zelda&sort=title");
  });

  it("shows a price chip", async () => {
    await mount("/store?minPrice=500&maxPrice=2000");
    expect($("ul[aria-label='Active filters']").textContent).toContain("€5.00 – €20.00");
  });

  it("applying a price goes to the URL in cents and resets the page", async () => {
    const { router } = await mount("/store?page=2");
    const min = $<HTMLInputElement>("aside [aria-label='Minimum price in euros']");
    setControlValue(min, "10");
    fire(min, new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(urlOf(router)).toBe("/store?minPrice=1000");
  });

  it("a price change replaces the history entry, but a checkbox adds one", async () => {
    const { router } = await mount("/store");
    const max = $<HTMLInputElement>("aside [aria-label='Maximum price in euros']");
    setControlValue(max, "30");
    fire(max, new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(urlOf(router)).toBe("/store?maxPrice=3000");
    await act(() => router.navigate(-1));
    expect(urlOf(router)).toBe("/"); // replaced: Back went straight past it

    await act(() => router.navigate("/store"));
    await flush();
    click(checkbox("Steam"));
    await flush();
    await act(() => router.navigate(-1));
    expect(urlOf(router)).toBe("/store"); // pushed: Back undoes just the click
  });
});

describe("StorePage: sort", () => {
  it("offers the six sorts in the agreed order and words", async () => {
    await mount();
    const options = $$("select option").map((o) => [o.getAttribute("value"), o.textContent]);
    expect(options).toEqual([
      ["popularity", "Most popular"],
      ["price_asc", "Price: low to high"],
      ["price_desc", "Price: high to low"],
      ["discount", "Biggest discount"],
      ["newest", "Newest"],
      ["title", "Name A–Z"],
    ]);
  });

  it("choosing a sort updates the URL and resets the page; the default sort is left out", async () => {
    const { router } = await mount("/store?page=3");
    const select = $<HTMLSelectElement>("select");
    setControlValue(select, "price_asc");
    await flush();
    expect(urlOf(router)).toBe("/store?sort=price_asc");
    expect(requested().at(-1)).toBe("/api/products?sort=price_asc");

    setControlValue(select, "popularity");
    await flush();
    expect(urlOf(router)).toBe("/store");
  });

  it("shows the sort of the URL", async () => {
    await mount("/store?sort=newest");
    expect($<HTMLSelectElement>("select").value).toBe("newest");
  });
});

describe("StorePage: pagination", () => {
  const manyResults = () => makeResponse([witcher, gta], { total: 108 }); // 108 / 24 = 5 pages

  it("shows the pages and a click on a number changes the URL and scrolls to the results", async () => {
    fakeApi.mockImplementation(async () => manyResults() as never);
    const { router } = await mount();
    // The arrows have no text; their accessible name is used instead.
    expect(
      $$("nav[aria-label=Pagination] li").map(
        (li) => li.textContent?.trim() || li.querySelector("button")?.getAttribute("aria-label"),
      ),
    ).toEqual(["Previous page", "1", "2", "3", "4", "5", "Next page"]);

    click($("button[aria-label='Page 2']"));
    await flush();
    expect(urlOf(router)).toBe("/store?page=2");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("page 1 is not written to the URL", async () => {
    fakeApi.mockImplementation(async () => ({ ...manyResults(), page: 2 }) as never);
    const { router } = await mount("/store?page=2");
    click($("button[aria-label='Previous page']"));
    await flush();
    expect(urlOf(router)).toBe("/store");
  });

  it("a filter change does NOT scroll (only page changes do)", async () => {
    await mount();
    click(checkbox("Steam"));
    await flush();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("explains a page number past the last page and offers the first page", async () => {
    fakeApi.mockImplementation(async () => makeResponse([], { total: 108, page: 9 }) as never);
    const { router } = await mount("/store?page=9");
    expect($("main, body").textContent).toContain("That page does not exist");
    fakeApi.mockImplementation(async () => manyResults() as never);
    click(button("Go to the first page"));
    await flush();
    expect(urlOf(router)).toBe("/store");
  });
});

describe("StorePage: empty and error states", () => {
  it("shows 'No products match these filters' and 'Clear filters' resets the filters", async () => {
    fakeApi.mockImplementation(async () => makeResponse([], { total: 0, facets: { ...facets, priceRange: null } }) as never);
    const { router } = await mount("/store?platform=steam&minPrice=99900&sort=title");
    expect(document.body.textContent).toContain("No products match these filters");
    expect($("[aria-live=polite]").textContent).toBe("0 results");

    click(button("Clear filters"));
    await flush();
    expect(urlOf(router)).toBe("/store?sort=title");
  });

  it("shows an error with Retry when the request fails, without the raw error text", async () => {
    fakeApi.mockImplementation(async () => {
      throw new ApiError("http", "HTTP 500: SELECT secret FROM somewhere", 500);
    });
    await mount();
    const alert = $("[role=alert]");
    expect(alert.textContent).toContain("We could not load the products.");
    expect(alert.textContent).not.toContain("SELECT");
    expect($$("li h3")).toHaveLength(0);

    // Retry asks again and shows the products when the server is back.
    fakeApi.mockImplementation(async () => makeResponse([witcher]) as never);
    click(button("Retry"));
    await flush();
    expect($("[role=alert]")).toBeNull();
    expect($$("li h3")).toHaveLength(1);
  });

  it("sanitizes a messy hand-typed URL: no 400, a clean request (S12)", async () => {
    await mount("/store?sort=foo&minPrice=abc&page=0&maxPrice=700&platform=steam,,steam");
    expect(requested()).toEqual(["/api/products?platform=steam&maxPrice=700"]);
    expect($$("li h3")).toHaveLength(2);
  });
});

describe("StorePage: search text q (Task 13b)", () => {
  const popular = makeItem({ slug: "hades-steam-global", title: "Hades" });
  /** The search request finds nothing; the "Popular right now" request (pageSize=8) gets one product. */
  function searchFindsNothing() {
    fakeApi.mockImplementation(async (path) =>
      (path.includes("pageSize=8")
        ? makeResponse([popular], { pageSize: 8 })
        : makeResponse([], { total: 0, facets: { ...facets, priceRange: null } })) as never,
    );
  }

  it("sends q to the API together with the filters", async () => {
    await mount("/store?q=witcher&platform=steam");
    expect(requested()).toEqual(["/api/products?q=witcher&platform=steam"]);
  });

  it("has no info line about search 'arriving later' any more", async () => {
    await mount("/store?q=witcher");
    expect($("[role=note]")).toBeNull();
  });

  it("titles the page 'Results for q' and keeps the result count", async () => {
    await mount("/store?q=witcher");
    expect($("h1").textContent).toBe("Results for 'witcher'");
    expect($$("h1")).toHaveLength(1);
    expect(document.title).toBe("Results for 'witcher' – EneHomeworkBa");
    expect($("[aria-live=polite]").textContent).toBe("2 results");
  });

  it("is titled 'Store' without q", async () => {
    await mount("/store");
    expect($("h1").textContent).toBe("Store");
    expect(button("Clear search")).toBeUndefined();
  });

  it("'Clear search' removes only q: the filters and a non-default sort stay", async () => {
    const { router } = await mount("/store?q=witcher&platform=steam&sort=price_asc&page=2");
    click(button("Clear search"));
    await flush();
    expect(urlOf(router)).toBe("/store?platform=steam&sort=price_asc");
  });

  it("offers 'Best match' only with q, and it is then the default (left out of the URL)", async () => {
    const { router } = await mount("/store?q=witcher");
    const select = $<HTMLSelectElement>("select");
    expect($$("select option").map((o) => o.textContent)[0]).toBe("Best match");
    expect(select.value).toBe("relevance");

    setControlValue(select, "price_asc");
    await flush();
    expect(urlOf(router)).toBe("/store?q=witcher&sort=price_asc");
    setControlValue(select, "relevance");
    await flush();
    expect(urlOf(router)).toBe("/store?q=witcher");
  });

  it("has no 'Best match' without q; 'Most popular' is the default", async () => {
    await mount("/store");
    expect($$("select option").map((o) => o.getAttribute("value"))).not.toContain("relevance");
    expect($<HTMLSelectElement>("select").value).toBe("popularity");
  });

  it("the drawer's sort radios also offer 'Best match' with q", async () => {
    await mount("/store?q=witcher");
    click(button("Sort and filter"));
    const radios = [...$("dialog").querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(radios[0].value).toBe("relevance");
    expect(radios[0].checked).toBe(true);
  });

  it("sort=relevance without q falls back to Most popular (sanitizer): not sent to the API", async () => {
    await mount("/store?sort=relevance&platform=steam");
    expect(requested()).toEqual(["/api/products?platform=steam"]);
    expect($<HTMLSelectElement>("select").value).toBe("popularity");
  });

  it("clearing q while sorted by Best match also drops sort=relevance from the URL", async () => {
    const { router } = await mount("/store?q=witcher&sort=relevance");
    click(button("Clear search"));
    await flush();
    expect(urlOf(router)).toBe("/store");
    expect(requested().at(-1)).toBe("/api/products");
  });

  it("drops a one-character q instead of sending it (the API needs 2-100 characters)", async () => {
    await mount("/store?q=a&platform=steam");
    expect(requested()).toEqual(["/api/products?platform=steam"]);
    expect($("h1").textContent).toBe("Store");
  });

  it("no results: 'No results for q', 'Clear search' and a 'Popular right now' grid of 8", async () => {
    searchFindsNothing();
    const { router } = await mount("/store?q=qwertyzz");
    expect(document.body.textContent).toContain("No results for 'qwertyzz'");
    expect(requested()).toContain("/api/products?pageSize=8");
    const section = $("section[aria-labelledby]");
    expect(section.querySelector("h2")?.textContent).toBe("Popular right now");
    expect([...section.querySelectorAll("li h3")].map((h) => h.textContent)).toEqual(["Hades"]);
    expect(button("Clear filters")).toBeUndefined(); // no filter is active

    // Two "Clear search" buttons (next to the title and in the empty state); both remove only q.
    const clears = $$("button").filter((b) => b.textContent?.trim() === "Clear search");
    expect(clears).toHaveLength(2);
    click(clears[1]);
    await flush();
    expect(urlOf(router)).toBe("/store");
  });

  it("no results with a filter also offers 'Clear filters'", async () => {
    searchFindsNothing();
    const { router } = await mount("/store?q=qwertyzz&platform=steam");
    click(button("Clear filters"));
    await flush();
    expect(urlOf(router)).toBe("/store?q=qwertyzz");
  });

  it("a search that finds products shows no 'Popular right now'", async () => {
    await mount("/store?q=witcher");
    expect(document.body.textContent).not.toContain("Popular right now");
    expect(requested()).not.toContain("/api/products?pageSize=8");
  });
});

describe("StorePage: mobile filter drawer", () => {
  const dialog = () => $<HTMLDialogElement>("dialog");

  it("'Sort and filter (n)' counts the active filters and opens the drawer with the same filters", async () => {
    await mount("/store?platform=steam,psn&minPrice=500");
    const opener = button("Sort and filter (3)");
    expect(dialog().hasAttribute("open")).toBe(false);
    click(opener);
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(dialog().getAttribute("aria-labelledby")).toBeTruthy();
    expect(checkbox("Steam", dialog()).checked).toBe(true);
  });

  it("filters change instantly while the drawer is open, and 'Show N results' closes it", async () => {
    const { router } = await mount("/store");
    click(button("Sort and filter"));
    click(checkbox("Europe", dialog()));
    await flush();
    expect(urlOf(router)).toBe("/store?region=europe"); // applied at once
    expect(dialog().hasAttribute("open")).toBe(true);

    click(button("Show 2 results"));
    expect(dialog().hasAttribute("open")).toBe(false);
  });

  it("the close button closes it", async () => {
    await mount();
    click(button("Sort and filter"));
    click($("button[aria-label='Close filters']"));
    expect(dialog().hasAttribute("open")).toBe(false);
  });

  it("closes when the browser closes it (Esc), and the button works again", async () => {
    await mount();
    click(button("Sort and filter"));
    act(() => dialog().close()); // what the browser does on Esc: closes the dialog and fires `close`
    // State followed the DOM: opening again works (it would not if `open` were still true).
    click(button("Sort and filter"));
    expect(dialog().hasAttribute("open")).toBe(true);
  });

  it("has the sort as radios: the URL's sort is checked and a click changes the URL at once", async () => {
    const { router } = await mount("/store?sort=newest");
    click(button("Sort and filter"));
    const radios = [...dialog().querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(["newest"]);

    click(radios.find((r) => r.value === "price_asc")!);
    await flush();
    expect(urlOf(router)).toBe("/store?sort=price_asc");
    expect(dialog().hasAttribute("open")).toBe(true); // like the filters: applied at once, the drawer stays open
  });

  it("closes on a click on the dimmed page behind it, but not on a click inside the panel", async () => {
    await mount();
    click(button("Sort and filter"));
    click(dialog().querySelector("h2")!); // inside the panel
    expect(dialog().hasAttribute("open")).toBe(true);
    click(dialog()); // the backdrop: a click there lands on the <dialog> element itself
    expect(dialog().hasAttribute("open")).toBe(false);
  });

  it("has no filter controls inside while closed (the sidebar is the only copy)", async () => {
    await mount();
    expect(dialog().querySelectorAll("input[type=checkbox]")).toHaveLength(0);
  });
});

describe("StorePage: filter groups", () => {
  const toggle = (title: string) => $$("aside button[aria-expanded]").find((b) => b.textContent?.startsWith(title))!;

  it("shows Price range first, then Platform and Region (Eneba's order)", async () => {
    await mount();
    expect($$("aside h3 span:first-child").map((title) => title.textContent)).toEqual([
      "Price range (EUR)",
      "Platform",
      "Region",
    ]);
  });

  it("a group with ticked options shows how many are ticked; none ticked = no badge", async () => {
    await mount("/store?platform=steam,psn");
    expect(toggle("Platform").textContent).toBe("Platform2 selected");
    expect(toggle("Region").textContent).toBe("Region");
  });
});
