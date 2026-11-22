// @vitest-environment jsdom
// The header search combobox in an in-memory router, with apiFetch replaced by a fake (no server, no network).
// Fake timers drive the 200 ms debounce, so "typing fast" is exact and the tests do not wait for real time.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider, useLocation, useSearchParams } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../api/client.ts";
import type { Suggestion, SuggestionsResponse } from "../../api/types.ts";
import { fire, render, setControlValue } from "../../test-utils.tsx";
import { SearchBox, SUGGEST_DEBOUNCE_MS } from "./SearchBox.tsx";

vi.mock("../../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client.ts")>()),
  apiFetch: vi.fn(),
}));

const fakeApi = vi.mocked(apiFetch);

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    gameTitle: "The Witcher 3: Wild Hunt",
    productSlug: "the-witcher-3-wild-hunt-steam-global",
    platform: { slug: "steam", name: "Steam" },
    region: { slug: "global", name: "Global" },
    coverUrl: "https://images.example/witcher.jpg",
    priceCents: 1099,
    inStock: true,
    matchedAlias: null,
    ...overrides,
  };
}

const witcher = makeSuggestion();
const witcher2 = makeSuggestion({
  gameTitle: "The Witcher 2: Assassins of Kings",
  productSlug: "the-witcher-2-gog-global",
  platform: { slug: "gog", name: "GOG" },
  priceCents: null,
  inStock: false,
});
const gta = makeSuggestion({
  gameTitle: "Grand Theft Auto V",
  productSlug: "gta-v-steam-global",
  matchedAlias: "GTA V",
  priceCents: 1499,
});

/** The suggest requests made so far (the q of each). */
const suggestCalls = () =>
  fakeApi.mock.calls
    .map((call) => call[0])
    .filter((path) => path.startsWith("/api/search/suggest"))
    .map((path) => new URL(path, "http://x").searchParams.get("q"));

/** Answers by search text: "gta" -> GTA, "qwertyzz" -> nothing, anything else -> the two Witcher games. */
function answerFor(path: string): SuggestionsResponse | object {
  if (!path.startsWith("/api/search/suggest")) return {}; // product prefetch
  const q = new URL(path, "http://x").searchParams.get("q");
  if (q === "gta") return { items: [gta] };
  if (q === "qwertyzz") return { items: [] };
  return { items: [witcher, witcher2] };
}

/** The page around the field: like the Header, the field gets ?q= only on /store. */
function Harness() {
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const urlQuery = pathname === "/store" ? (searchParams.get("q") ?? undefined) : undefined;
  return (
    <>
      <SearchBox urlQuery={urlQuery} label="Search games" placeholder="Search games" />
      <button type="button">elsewhere</button>
    </>
  );
}

let cleanup: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  fakeApi.mockReset();
  fakeApi.mockImplementation(async (path) => answerFor(path) as never);
});
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});

function mount(url = "/") {
  const router = createMemoryRouter(
    [
      { path: "/", Component: Harness },
      { path: "/store", Component: Harness },
      { path: "/product/:slug", Component: Harness },
    ],
    { initialEntries: [url] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
  return { router };
}

const input = () => document.querySelector<HTMLInputElement>("input[role=combobox]")!;
const listbox = () => document.querySelector<HTMLElement>("[role=listbox]")!;
const options = () => [...listbox().querySelectorAll<HTMLElement>("[role=option]")];
const optionTexts = () => options().map((o) => o.textContent);
const statusText = () => document.querySelector("[role=status]")!.textContent;
const urlOf = (router: ReturnType<typeof mount>["router"]) => router.state.location.pathname + router.state.location.search;
/** Lets time pass (the debounce, TanStack Query's timers) and the fake API answer. */
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
/**
 * Lets a started request finish and React show it. The answer is handed to React through a timer that only exists
 * AFTER the fake API answered, so one advance is not enough: take a few short steps.
 */
async function settle() {
  for (let step = 0; step < 5; step++) await wait(10);
}
const key = (k: string) => fire(input(), new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

/** Types `text` and waits until the suggestions have arrived. */
async function typeAndWait(text: string) {
  act(() => input().focus());
  setControlValue(input(), text);
  await wait(SUGGEST_DEBOUNCE_MS);
  await settle();
}

describe("SearchBox: requests", () => {
  it("fast typing sends ONE request, for the final text (debounce)", async () => {
    mount();
    act(() => input().focus());
    for (const text of ["w", "wi", "wit", "witc", "witch", "witche", "witcher"]) {
      setControlValue(input(), text);
      await wait(50); // faster than the 200 ms pause
    }
    expect(suggestCalls()).toEqual([]);
    await wait(SUGGEST_DEBOUNCE_MS);
    expect(suggestCalls()).toEqual(["witcher"]);
  });

  it("asks nothing for a single character and shows no list", async () => {
    mount();
    await typeAndWait("w");
    expect(suggestCalls()).toEqual([]);
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(listbox().hidden).toBe(true);
  });

  it("does not ask for suggestions by itself when a Store page opens with ?q=", async () => {
    mount("/store?q=witcher");
    await wait(1000);
    expect(input().value).toBe("witcher");
    expect(suggestCalls()).toEqual([]);
  });

  it("a slow answer for an older text never replaces the rows of the newer text", async () => {
    // "wit" answers late (after "witcher"); every text has its own cache key, so its rows are never shown for "witcher".
    let finishOld!: (value: SuggestionsResponse) => void;
    fakeApi.mockImplementation((path) => {
      if (path.endsWith("q=wit")) return new Promise((resolve) => (finishOld = resolve as never));
      return Promise.resolve(answerFor(path) as never);
    });
    mount();
    await typeAndWait("wit");
    await typeAndWait("witcher");
    expect(optionTexts()[0]).toContain("The Witcher 3");

    act(() => finishOld({ items: [gta] }));
    await settle();
    expect(optionTexts()[0]).toContain("The Witcher 3");
    expect(optionTexts().join()).not.toContain("Grand Theft Auto");
  });

  it("shows a spinner in the field while the suggestions load, and keeps the old rows meanwhile", async () => {
    mount();
    await typeAndWait("witcher");
    let finish!: (value: SuggestionsResponse) => void;
    fakeApi.mockImplementation((path) =>
      path.startsWith("/api/search/suggest") ? new Promise((resolve) => (finish = resolve as never)) : Promise.resolve({} as never),
    );
    setControlValue(input(), "gta");
    await wait(SUGGEST_DEBOUNCE_MS);
    await settle();
    expect(document.querySelector("form [aria-hidden=true][class*=spinner]")).not.toBeNull();
    expect(optionTexts()[0]).toContain("The Witcher 3"); // no flicker: the previous rows stay

    act(() => finish({ items: [gta] }));
    await settle();
    expect(document.querySelector("form [class*=spinner]")).toBeNull();
    expect(optionTexts()[0]).toContain("Grand Theft Auto V");
  });
});

describe("SearchBox: the list", () => {
  it("shows one row per game and a last 'See all results' row; ARIA links the field to the list", async () => {
    mount();
    await typeAndWait("witcher");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(input().getAttribute("aria-controls")).toBe(listbox().id);
    expect(input().getAttribute("aria-autocomplete")).toBe("list");
    expect(listbox().hidden).toBe(false);
    expect(options()).toHaveLength(3);
    expect(options()[0].textContent).toBe("The Witcher 3: Wild HuntSteam · GlobalFrom€10.99");
    expect(options()[1].textContent).toBe("The Witcher 2: Assassins of KingsGOG · GlobalOut of stock");
    expect(options()[2].textContent).toBe("See all results for 'witcher'");
    expect(options()[0].getAttribute("href")).toBe("/product/the-witcher-3-wild-hunt-steam-global");
    expect(options()[2].getAttribute("href")).toBe("/store?q=witcher");
    // The rows are not in the Tab order: the focus stays in the field.
    expect(options().every((o) => o.tabIndex === -1)).toBe(true);
    expect(statusText()).toBe("2 games found. Use the up and down arrows to choose.");
  });

  it("highlights the typed part of the title", async () => {
    mount();
    await typeAndWait("WITCH");
    const marks = [...options()[0].querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).toEqual(["Witch"]);
  });

  it("an alias hit says which name matched ('gta' -> Also known as GTA V)", async () => {
    mount();
    await typeAndWait("gta");
    expect(options()[0].textContent).toBe("Grand Theft Auto VAlso known as GTA VSteam · GlobalFrom€14.99");
    expect([...options()[0].querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["GTA"]); // inside the alias
  });

  it("no matches: one 'No matches' row, no 'See all results', and the list is not 'expanded'", async () => {
    mount();
    await typeAndWait("qwertyzz");
    expect(document.body.textContent).toContain("No matches for 'qwertyzz'");
    expect(document.body.textContent).not.toContain("See all results");
    expect(options()).toHaveLength(0);
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(statusText()).toBe("No matches for 'qwertyzz'");
  });

  it("prefetches the product page data when a row is hovered", async () => {
    mount();
    await typeAndWait("witcher");
    fire(options()[1], new MouseEvent("mouseover", { bubbles: true })); // React's onMouseEnter listens to mouseover
    await settle();
    expect(fakeApi.mock.calls.map((c) => c[0])).toContain("/api/products/the-witcher-2-gog-global");
  });
});

describe("SearchBox: keyboard", () => {
  const activeId = () => input().getAttribute("aria-activedescendant");
  const selected = () => options().filter((o) => o.getAttribute("aria-selected") === "true");

  it("↓/↑ move the active row and wrap around; aria-activedescendant and aria-selected follow", async () => {
    mount();
    await typeAndWait("witcher");
    expect(activeId()).toBeNull();

    key("ArrowDown");
    expect(activeId()).toBe(options()[0].id);
    expect(selected()).toEqual([options()[0]]);
    key("ArrowDown");
    key("ArrowDown");
    expect(activeId()).toBe(options()[2].id); // "See all results"
    key("ArrowDown");
    expect(activeId()).toBe(options()[0].id); // wrapped to the first row
    key("ArrowUp");
    expect(activeId()).toBe(options()[2].id); // and back to the last
    expect(document.activeElement).toBe(input()); // the focus never left the field
  });

  it("moving onto a game row prefetches its product page", async () => {
    mount();
    await typeAndWait("witcher");
    key("ArrowDown");
    await settle();
    expect(fakeApi.mock.calls.map((c) => c[0])).toContain("/api/products/the-witcher-3-wild-hunt-steam-global");
  });

  it("Enter on a game row opens its product page and empties the field", async () => {
    const { router } = mount();
    await typeAndWait("witcher");
    key("ArrowDown");
    key("ArrowDown");
    key("Enter");
    await settle();
    expect(urlOf(router)).toBe("/product/the-witcher-2-gog-global");
    expect(input().value).toBe("");
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("Enter with no active row searches the Store for the text", async () => {
    const { router } = mount();
    await typeAndWait("witcher");
    // A real browser submits the form on Enter; jsdom does not, so the test does what the browser would.
    act(() => input().form!.requestSubmit());
    await settle();
    expect(urlOf(router)).toBe("/store?q=witcher");
    expect(input().value).toBe("witcher"); // the Store page's search is shown in the field
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("Enter on 'See all results' searches the Store for the text", async () => {
    const { router } = mount();
    await typeAndWait("witcher");
    key("ArrowUp"); // the last row
    key("Enter");
    await settle();
    expect(urlOf(router)).toBe("/store?q=witcher");
  });

  it("Enter with a single character does nothing", async () => {
    const { router } = mount();
    await typeAndWait("w");
    act(() => input().form!.requestSubmit());
    expect(urlOf(router)).toBe("/");
  });

  it("Esc closes the list (the text stays); a second Esc clears the field", async () => {
    mount();
    await typeAndWait("witcher");
    key("Escape");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(listbox().hidden).toBe(true);
    expect(input().value).toBe("witcher");
    key("Escape");
    expect(input().value).toBe("");
  });

  it("↓ opens the closed list again", async () => {
    mount();
    await typeAndWait("witcher");
    key("Escape");
    key("ArrowDown");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(input().getAttribute("aria-activedescendant")).toBeNull(); // opening does not pick a row yet
  });

  it("Tab closes the list", async () => {
    mount();
    await typeAndWait("witcher");
    key("Tab");
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("SearchBox: mouse", () => {
  it("a click on a row opens the product page", async () => {
    const { router } = mount();
    await typeAndWait("witcher");
    act(() => options()[0].click());
    await settle();
    expect(urlOf(router)).toBe("/product/the-witcher-3-wild-hunt-steam-global");
    expect(input().value).toBe("");
  });

  it("pressing the mouse on a row keeps the focus in the field", async () => {
    mount();
    await typeAndWait("witcher");
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    fire(options()[0], down);
    expect(down.defaultPrevented).toBe(true);
  });

  it("a click outside closes the list; a click in the field does not", async () => {
    mount();
    await typeAndWait("witcher");
    fire(input(), new Event("pointerdown", { bubbles: true }));
    expect(input().getAttribute("aria-expanded")).toBe("true");
    fire(document.querySelector("button[type=button]")!, new Event("pointerdown", { bubbles: true }));
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("SearchBox: text from the URL", () => {
  it("shows the Store page's search text and follows it when the URL changes", async () => {
    const { router } = mount("/store?q=zelda");
    expect(input().value).toBe("zelda");
    await act(() => router.navigate("/store?q=portal"));
    expect(input().value).toBe("portal");
    await act(() => router.navigate("/product/x"));
    expect(input().value).toBe(""); // other pages: empty field
  });
});
