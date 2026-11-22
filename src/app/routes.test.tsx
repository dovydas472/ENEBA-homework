// @vitest-environment jsdom
// Integration test of the app shell: the real routes, layout, header, banner and footer,
// rendered in an in-memory router (no server, no network).
import { QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { polyfillDialog, render, setControlValue } from "../test-utils.tsx";
import { createQueryClient } from "./queryClient.ts";
import { routes } from "./routes.ts";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function renderApp(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  const view = render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
  return { router, container: view.container };
}

const banner = "aside[aria-label='Demo notice']";
const $ = (selector: string) => document.querySelector(selector);
const searchInput = () => $("input[type=search]") as HTMLInputElement;

/** Types into the search field and submits the form, like a user pressing Enter. */
function search(text: string) {
  setControlValue(searchInput(), text);
  act(() => ($("form[role=search]") as HTMLFormElement).requestSubmit());
}

const urlOf = (router: ReturnType<typeof renderApp>["router"]) => router.state.location.pathname + router.state.location.search;

describe("app shell", () => {
  it("shows the demo banner with the exact text, on every page", () => {
    const text = "Internship demo – not affiliated with Eneba. Sign-in and checkout are simulated.";
    renderApp("/");
    expect($(banner)?.textContent).toBe(text);
    cleanup?.();
    renderApp("/store");
    expect($(banner)?.textContent).toBe(text);
  });

  it("banner cannot be dismissed (no button inside it)", () => {
    renderApp("/");
    expect($(`${banner} button`)).toBeNull();
  });

  it("shows the wordmark linking home, the cart (no badge while empty, like Eneba), and a Sign in link", () => {
    renderApp("/store");
    expect($("header a[href='/']")?.textContent).toBe("EneHomeworkBa");
    expect($("header a[href='/cart']")?.getAttribute("aria-label")).toBe("Cart, 0 items");
    expect($("header a[href='/cart']")?.textContent).toBe("");
    expect($("header a[href='/login']")?.getAttribute("aria-label")).toBe("Sign in");
  });

  it("has a main nav strip with the Store and the platform shortcuts", () => {
    renderApp("/");
    const links = [...document.querySelectorAll("header nav[aria-label=Main] a")];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Store", "/store"],
      ["Steam", "/store?platform=steam"],
      ["PSN", "/store?platform=psn"],
      ["Xbox Live", "/store?platform=xbox-live"],
      ["Nintendo eShop", "/store?platform=nintendo-eshop"],
    ]);
  });

  it("the home page has a 'Browse the store' link to /store", () => {
    const { router } = renderApp("/");
    const link = [...document.querySelectorAll("main a")].find((a) => a.textContent === "Browse the store") as HTMLElement;
    expect(link.getAttribute("href")).toBe("/store");
    act(() => link.click());
    expect(urlOf(router)).toBe("/store");
  });

  it("shows the footer with the IGDB credit and the GitHub link", () => {
    renderApp("/");
    const footer = $("footer");
    expect(footer?.textContent).toContain("Game data and cover art provided by IGDB");
    expect(footer?.querySelector("a[href='https://www.igdb.com']")).not.toBeNull();
    expect(footer?.querySelector("a[href='https://github.com/dovydas472/ENEBA-homework']")).not.toBeNull();
  });
});

describe("routes and document titles", () => {
  it.each([
    ["/", "EneHomeworkBa – internship demo"],
    ["/store", "Store – EneHomeworkBa"],
    ["/product/silent-hill-2", "Product – EneHomeworkBa"],
    ["/cart", "Cart – EneHomeworkBa"],
    ["/login", "Sign in – EneHomeworkBa"],
    ["/register", "Create account – EneHomeworkBa"],
    ["/orders", "Orders – EneHomeworkBa"],
    ["/nope/not/here", "Page not found – EneHomeworkBa"],
  ])("%s has the tab title %s", (url, title) => {
    renderApp(url);
    expect(document.title).toBe(title);
  });

  it("renders a placeholder page inside the layout", () => {
    renderApp("/orders");
    expect($("main h1")?.textContent).toBe("Orders");
    expect($("main")?.textContent).toContain("Coming in a later task");
    expect($("header")).not.toBeNull();
    expect($("footer")).not.toBeNull();
  });

  it("shows the 404 page INSIDE the layout for an unknown URL", () => {
    renderApp("/definitely/unknown");
    expect($("main h1")?.textContent).toBe("Page not found");
    expect($("header")).not.toBeNull();
    expect($(banner)).not.toBeNull();
    expect($("footer")).not.toBeNull();
  });
});

describe("header search", () => {
  it("goes to /store?q=<text> on submit", () => {
    const { router } = renderApp("/");
    search("half life");
    expect(urlOf(router)).toBe("/store?q=half%20life");
    expect($("main h1")?.textContent).toBe("Results for 'half life'");
  });

  it("does nothing on an empty (or blank) submit", () => {
    const { router } = renderApp("/");
    search("   ");
    expect(urlOf(router)).toBe("/");
  });

  it("Back returns to the previous page", async () => {
    const { router } = renderApp("/");
    search("zelda");
    await act(() => router.navigate(-1));
    expect(urlOf(router)).toBe("/");
    expect($("main h1")?.textContent).toBe("Home");
  });

  it("shows the current search text in the field on the Store page", () => {
    renderApp("/store?q=zelda");
    expect(searchInput().value).toBe("zelda");
  });

  it("shows an empty field on other pages, even with a ?q= in their URL", () => {
    renderApp("/?q=zelda");
    expect(searchInput().value).toBe("");
  });

  it("is a combobox that controls the suggestions list", () => {
    renderApp("/");
    expect(searchInput().getAttribute("role")).toBe("combobox");
    const listId = searchInput().getAttribute("aria-controls")!;
    expect(document.getElementById(listId)?.getAttribute("role")).toBe("listbox");
  });

  it("the field has an accessible name", () => {
    renderApp("/");
    expect(searchInput().getAttribute("aria-label")).toBe("Search games");
  });
});

describe("keyboard shortcut", () => {
  const press = (target: Element, key = "/") =>
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });

  it('"/" focuses the search field', () => {
    renderApp("/");
    press(document.body);
    expect(document.activeElement).toBe(searchInput());
  });

  it('"/" does not steal focus while typing in another input', () => {
    renderApp("/");
    const other = document.createElement("input");
    document.body.append(other);
    other.focus();
    press(other);
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it("other keys do nothing", () => {
    renderApp("/");
    press(document.body, "a");
    expect(document.activeElement).not.toBe(searchInput());
  });
});

// The phone header (≤ 930 px). jsdom has no CSS media queries, so these tests check the behaviour, not the visibility.
describe("phone header: ☰ menu", () => {
  beforeEach(polyfillDialog);
  const menu = () => $("dialog[aria-label=Menu]") as HTMLDialogElement;
  const openMenu = () => act(() => ($("button[aria-label='Open menu']") as HTMLElement).click());

  it("opens the menu with the same links as the nav strip, and the close button closes it", () => {
    renderApp("/");
    expect(menu().hasAttribute("open")).toBe(false);
    expect(menu().querySelectorAll("a[href^='/store']")).toHaveLength(0); // no second "Main" nav while closed

    openMenu();
    expect(menu().hasAttribute("open")).toBe(true);
    expect([...menu().querySelectorAll("nav a")].map((a) => a.textContent)).toEqual([
      "Store",
      "Steam",
      "PSN",
      "Xbox Live",
      "Nintendo eShop",
    ]);

    act(() => ($("button[aria-label='Close menu']") as HTMLElement).click());
    expect(menu().hasAttribute("open")).toBe(false);
  });

  it("a link navigates and closes the menu", () => {
    const { router } = renderApp("/");
    openMenu();
    const psn = [...menu().querySelectorAll("nav a")].find((a) => a.textContent === "PSN") as HTMLElement;
    act(() => psn.click());
    expect(urlOf(router)).toBe("/store?platform=psn");
    expect(menu().hasAttribute("open")).toBe(false);
  });

  it("follows the browser closing it (Esc): it can be opened again", () => {
    renderApp("/");
    openMenu();
    act(() => menu().close());
    openMenu();
    expect(menu().hasAttribute("open")).toBe(true);
  });
});

describe("phone header: search icon", () => {
  const toggle = () => $("button[aria-label='Search']") as HTMLButtonElement;
  const searchBox = () => toggle().closest("header")!.querySelector("[class*=searchOpen]");

  it("opens the search row with the cursor in the field; Esc closes it and focus goes back to the icon", () => {
    renderApp("/");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    act(() => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(searchBox()).not.toBeNull();
    expect(document.activeElement).toBe(searchInput());

    act(() => {
      searchInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle());
  });

  it("the close button closes it", () => {
    renderApp("/");
    act(() => toggle().click());
    act(() => ($("button[aria-label='Close search']") as HTMLElement).click());
    expect(searchBox()).toBeNull();
  });

  it("a search closes the row and goes to the Store", () => {
    const { router } = renderApp("/");
    act(() => toggle().click());
    search("zelda");
    expect(urlOf(router)).toBe("/store?q=zelda");
    expect(searchBox()).toBeNull();
  });
});
