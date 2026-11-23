// @vitest-environment jsdom
// SPA accessibility (Task 17): after a change of PATH the focus moves to the new page's h1 and the new title is
// announced; a change of the query string only (a Store filter) leaves the focus where it is; the first load does nothing.
import { QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../test-utils.tsx";
import { loadAllPages } from "./lazyPages.ts";
import { createQueryClient } from "./queryClient.ts";
import { routes } from "./routes.ts";

let cleanup: (() => void) | undefined;
beforeAll(() => loadAllPages());
beforeEach(() => {
  window.scrollTo = vi.fn() as never; // jsdom has no scrolling; ScrollRestoration calls it
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response('{"error":"not signed in"}', { status: 401 })),
  );
});
afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
});

/** Lets the router and React finish, and the announcer's animation frame run. */
async function flush() {
  for (let round = 0; round < 2; round++) {
    await act(async () => {
      for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
  }
}

function renderApp(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  const view = render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
  return router;
}

const announcement = () => document.querySelector("[aria-live=polite][aria-atomic=true]")?.textContent;

describe("RouteAnnouncer", () => {
  it("does nothing on the first load (the browser already starts at the top)", async () => {
    renderApp("/nope");
    await flush();
    expect(document.activeElement).toBe(document.body);
    expect(announcement()).toBe("");
  });

  it("after a navigation focuses the new page's h1 and announces its title", async () => {
    const router = renderApp("/nope");
    await flush();
    await act(() => router.navigate("/cart"));
    await flush();
    const h1 = document.querySelector("main h1")!;
    expect(h1.textContent).toBe("Your cart is empty");
    expect(document.activeElement).toBe(h1);
    expect(h1.getAttribute("tabindex")).toBe("-1"); // focusable by script, not by Tab
    expect(announcement()).toBe("Cart – EneHomeworkBa");
  });

  it("a change of the query string only (e.g. a Store filter) leaves the focus where it is", async () => {
    const router = renderApp("/nope?a=1");
    await flush();
    const search = document.querySelector<HTMLInputElement>("header input[type=search]")!;
    act(() => search.focus());
    await act(() => router.navigate("/nope?a=2"));
    await flush();
    expect(document.activeElement).toBe(search);
    expect(announcement()).toBe("");
  });

  it("a redirect (orders while signed out -> sign in) ends with the focus on the final page's h1", async () => {
    const router = renderApp("/nope");
    await flush();
    await act(() => router.navigate("/orders"));
    await flush();
    expect(router.state.location.pathname).toBe("/login");
    expect(document.activeElement?.tagName).toBe("H1");
    expect(announcement()).toBe("Sign in – EneHomeworkBa");
  });

  it("a page without an h1 yet (a product still loading) gets the focus on <main>", async () => {
    // The product request never answers: the page stays on its skeleton, which has no h1.
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        path.startsWith("/api/products/") ? new Promise(() => {}) : Promise.resolve(new Response("{}", { status: 401 })),
      ),
    );
    const router = renderApp("/nope");
    await flush();
    await act(() => router.navigate("/product/the-witcher-3"));
    await flush();
    expect(document.querySelector("main h1")).toBeNull();
    expect(document.activeElement).toBe(document.getElementById("main"));
    expect(announcement()).toBe("Product – EneHomeworkBa");
  });
});
