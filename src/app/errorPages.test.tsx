// @vitest-environment jsdom
// Resilience (Task 17): a render error never white-screens the app.
//  - a PAGE that crashes -> RouteError inside the layout (header, footer, notices stay), with Retry and Home;
//  - the FRAME that crashes -> AppError, a full page of its own with Retry and Home.
// The crashes are switched on per test through the mocked NotFoundPage (a page) and Footer (part of the frame).
import { QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../test-utils.tsx";
import { pageLoaders } from "./lazyPages.ts";
import { createQueryClient } from "./queryClient.ts";
import { routes } from "./routes.ts";

const crash = vi.hoisted(() => ({ page: false, frame: false }));

vi.mock("../pages/NotFoundPage.tsx", () => ({
  NotFoundPage: () => {
    if (crash.page) throw new Error("test: the page crashed");
    return <h1>Page not found</h1>;
  },
}));
vi.mock("./Footer.tsx", () => ({
  Footer: () => {
    if (crash.frame) throw new Error("test: the footer crashed");
    return <footer>footer</footer>;
  },
}));

let cleanup: (() => void) | undefined;
beforeEach(() => {
  crash.page = false;
  crash.frame = false;
  window.scrollTo = vi.fn() as never; // jsdom has no scrolling; ScrollRestoration calls it
  vi.spyOn(console, "error").mockImplementation(() => {}); // the boundaries log the error on purpose
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path === "/api/homepage" ? new Response('{"blocks":[]}', { status: 200 }) : new Response("{}", { status: 401 }),
    ),
  );
});
afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flush = () =>
  act(async () => {
    for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
  });

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

const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
const buttonNamed = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === name);

describe("a page that crashes", () => {
  it("shows 'Something went wrong' with Retry and Home INSIDE the layout", async () => {
    crash.page = true;
    renderApp("/nope");
    await flush();
    expect($("main h1")?.textContent).toBe("Something went wrong");
    expect($("main [role=alert]")).not.toBeNull();
    expect(buttonNamed("Retry")).toBeDefined();
    expect($("main a[href='/']")?.textContent).toBe("Home");
    // The frame is still there: header (with the search), footer.
    expect($("header input[type=search]")).not.toBeNull();
    expect($("footer")).not.toBeNull();
    expect(document.title).toBe("Something went wrong – EneHomeworkBa");
    expect(console.error).toHaveBeenCalled(); // the real error goes to the console for the developer
  });

  it("never shows the error text itself (it is a generic message)", async () => {
    crash.page = true;
    renderApp("/nope");
    await flush();
    expect(document.body.textContent).not.toContain("test: the page crashed");
  });

  it("Home goes to the home page and the error is gone", async () => {
    crash.page = true;
    const router = renderApp("/nope");
    await flush();
    await act(async () => $("main a[href='/']")!.click());
    await flush();
    expect(router.state.location.pathname).toBe("/");
    expect($("main [role=alert]")).toBeNull();
  });
});

describe("a page whose code cannot be downloaded (Task 17, lazy routes)", () => {
  it("shows the same error page inside the layout, not a blank screen", async () => {
    // E.g. offline, or an old tab after a new deploy removed the chunk.
    vi.spyOn(pageLoaders, "cart").mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));
    renderApp("/cart");
    await flush();
    await flush();
    expect($("main h1")?.textContent).toBe("Something went wrong");
    expect(buttonNamed("Retry")).toBeDefined(); // Retry reloads: a fresh document fetches the current chunks
    expect($("header input[type=search]")).not.toBeNull();
  });
});

describe("the frame that crashes", () => {
  it("shows a full error page of its own with Retry and Home (no blank screen)", async () => {
    crash.frame = true;
    renderApp("/");
    await flush();
    expect($("h1")?.textContent).toBe("Something went wrong");
    expect(buttonNamed("Retry")).toBeDefined();
    expect($("a[href='/']")?.textContent).toBe("Home");
    expect($("header")).toBeNull(); // the frame is what failed
    expect(document.body.textContent).toContain("EneHomeworkBa"); // the wordmark as text
  });
});
