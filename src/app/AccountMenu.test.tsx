// @vitest-environment jsdom
// The header account menu and the phone menu's account part, signed in and signed out, inside the REAL routes
// with apiFetch replaced by a fake auth server.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter } from "react-router";
// The same provider as main.tsx: it wires ReactDOM.flushSync, which sign-out's navigation relies on.
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../api/auth.ts";
import { apiFetch } from "../api/client.ts";
import { fakeAuthServer, newFakeAuthState, type FakeAuthState } from "../features/auth/fakeAuthServer.ts";
import { polyfillDialog, pressKey, render } from "../test-utils.tsx";
import { loadAllPages } from "./lazyPages.ts";
import { routes } from "./routes.ts";

vi.mock("../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client.ts")>()),
  apiFetch: vi.fn(),
}));

const fakeApi = vi.mocked(apiFetch);
const me: User = { id: 1, email: "me@example.com", isDemo: false };
let server: FakeAuthState;
let cleanup: (() => void) | undefined;

// Task 17: the lazily loaded pages (lazyPages.ts) are loaded once up front, so no test waits for a module mid-render.
beforeAll(() => loadAllPages());
beforeEach(() => {
  window.scrollTo = vi.fn() as never;
  polyfillDialog();
  server = newFakeAuthState();
  fakeApi.mockReset();
  fakeApi.mockImplementation(fakeAuthServer(server));
});
afterEach(() => cleanup?.());

const settle = async () => {
  for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const flush = () => act(settle);

async function mount(url = "/cart") {
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
const urlOf = (router: Awaited<ReturnType<typeof mount>>["router"]) => router.state.location.pathname + router.state.location.search;
const accountButton = () => $<HTMLButtonElement>("header button[aria-label^='Account:']")!;
const popup = () => document.getElementById(accountButton().getAttribute("aria-controls")!)!;
async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await settle();
  });
}

describe("header: signed out", () => {
  it("shows 'Sign in' and no account menu", async () => {
    await mount("/cart");
    expect($("header a[aria-label='Sign in']")?.getAttribute("href")).toBe("/login?next=%2Fcart");
    expect($("header button[aria-label^='Account:']")).toBeNull();
  });
});

describe("header: signed in (account menu)", () => {
  beforeEach(() => {
    server.user = me;
  });

  it("replaces 'Sign in' with a closed menu button showing the email", async () => {
    await mount();
    expect($("header a[aria-label='Sign in']")).toBeNull();
    expect(accountButton().textContent).toBe("me@example.com");
    expect(accountButton().getAttribute("aria-expanded")).toBe("false");
    expect(popup().hidden).toBe(true);
  });

  it("opens on click with 'Signed in as', Orders and Sign out", async () => {
    await mount();
    await click(accountButton());
    expect(accountButton().getAttribute("aria-expanded")).toBe("true");
    expect(popup().hidden).toBe(false);
    expect(popup().textContent).toContain("Signed in as me@example.com");
    expect(popup().querySelector("a[href='/orders']")?.textContent).toBe("Orders");
    expect([...popup().querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Sign out"]);
  });

  it("Esc closes it and puts the focus back on the button", async () => {
    await mount();
    await click(accountButton());
    const orders = popup().querySelector<HTMLAnchorElement>("a[href='/orders']")!;
    act(() => orders.focus());
    pressKey(orders, "Escape");
    expect(popup().hidden).toBe(true);
    expect(accountButton().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(accountButton());
  });

  it("a click outside closes it; a click inside does not", async () => {
    await mount();
    await click(accountButton());
    act(() => popup().dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(popup().hidden).toBe(false);
    act(() => document.querySelector("main")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(popup().hidden).toBe(true);
  });

  it("closes when the focus leaves it (Tab past the last item)", async () => {
    await mount();
    await click(accountButton());
    const signOut = popup().querySelector("button")!;
    act(() => signOut.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.querySelector("main") })));
    expect(popup().hidden).toBe(true);
  });

  it("'Orders' opens /orders and closes the menu", async () => {
    const { router } = await mount();
    await click(accountButton());
    await click(popup().querySelector<HTMLAnchorElement>("a[href='/orders']")!);
    expect(urlOf(router)).toBe("/orders");
    expect(popup().hidden).toBe(true);
    await flush(); // the orders page asks for the list (Task 16b); the fake answers an empty one
    expect($("main h1")?.textContent).toBe("No orders yet");
  });

  it("'Sign out' calls the API, goes home and shows 'Sign in' again", async () => {
    server.handlers["POST /api/auth/logout"] = () => {
      server.user = null;
      return undefined;
    };
    const { router } = await mount("/orders");
    await click(accountButton());
    await click(popup().querySelector("button")!);
    expect(server.requests.map((r) => r.key)).toContain("POST /api/auth/logout");
    expect(urlOf(router)).toBe("/"); // home - not bounced to /login by the protected /orders page
    expect($("header a[aria-label='Sign in']")).not.toBeNull();
    expect($("header button[aria-label^='Account:']")).toBeNull();
    expect([...document.querySelectorAll("[role=status]")].map((e) => e.textContent).join(" | ")).toContain("You are signed out");
  });
});

describe("phone menu: account part", () => {
  const openMenu = () => click($<HTMLButtonElement>("header button[aria-label='Open menu']")!);
  const accountSection = () => $("dialog section[aria-label=Account]")!;

  it("signed out: Sign in and Create account, both returning to this page", async () => {
    await mount();
    await openMenu();
    const links = [...accountSection().querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Sign in", "/login?next=%2Fcart"],
      ["Create account", "/register?next=%2Fcart"],
    ]);
  });

  it("signed in: who, Orders and Sign out (same as the header menu)", async () => {
    server.user = { id: 3, email: "demo-1@demo.invalid", isDemo: true };
    server.handlers["POST /api/auth/logout"] = () => {
      server.user = null;
      return undefined;
    };
    const { router } = await mount("/cart");
    await openMenu();
    expect(accountSection().textContent).toContain("Signed in as Demo user");
    expect(accountSection().querySelector("a[href='/orders']")?.textContent).toBe("Orders");
    await click([...accountSection().querySelectorAll("button")].find((b) => b.textContent === "Sign out")!);
    expect(urlOf(router)).toBe("/");
    expect($("dialog")?.hasAttribute("open")).toBe(false);
    expect($("header a[aria-label='Sign in']")).not.toBeNull();
  });
});
