// @vitest-environment jsdom
// RequireAuth on its own: a protected page in a small in-memory router, apiFetch replaced by a fake auth server.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../api/client.ts";
import { render } from "../../test-utils.tsx";
import { fakeAuthServer, httpError, newFakeAuthState, type FakeAuthState } from "./fakeAuthServer.ts";
import { RequireAuth } from "./RequireAuth.tsx";

vi.mock("../../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client.ts")>()),
  apiFetch: vi.fn(),
}));

const fakeApi = vi.mocked(apiFetch);
let server: FakeAuthState;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  server = newFakeAuthState();
  fakeApi.mockReset();
  fakeApi.mockImplementation(fakeAuthServer(server));
});
afterEach(() => cleanup?.());

const settle = async () => {
  for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
};

function LoginStub() {
  const location = useLocation();
  return <p>login page {location.search}</p>;
}

async function mount(url: string) {
  const router = createMemoryRouter(
    [
      { path: "/login", Component: LoginStub },
      { Component: RequireAuth, children: [{ path: "/secret", element: <p>secret page</p> }] },
    ],
    { initialEntries: [url] },
  );
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
  return { router, container: view.container };
}

describe("RequireAuth", () => {
  it("shows a spinner (not the login page) while it asks who is signed in", async () => {
    fakeApi.mockImplementation(() => new Promise(() => {})); // never answers
    const { container, router } = await mount("/secret");
    expect(container.textContent).toBe("Checking your sign-in…");
    expect(router.state.location.pathname).toBe("/secret");
  });

  it("signed out: replaces the URL with /login?next=<the page, with its query>", async () => {
    const { router, container } = await mount("/secret?tab=2");
    await act(settle);
    expect(router.state.location.pathname + router.state.location.search).toBe("/login?next=%2Fsecret%3Ftab%3D2");
    expect(router.state.historyAction).toBe("REPLACE"); // Back must not bounce into the redirect again
    expect(container.textContent).toBe("login page ?next=%2Fsecret%3Ftab%3D2");
  });

  it("signed in: shows the page", async () => {
    server.user = { id: 1, email: "me@example.com", isDemo: false };
    const { container } = await mount("/secret");
    await act(settle);
    expect(container.textContent).toBe("secret page");
  });

  it("server down: an error with Retry (not a redirect), then the page once it answers", async () => {
    fakeApi.mockImplementationOnce(async () => {
      throw httpError(503, "service temporarily unavailable");
    });
    server.user = { id: 1, email: "me@example.com", isDemo: false };
    const { container, router } = await mount("/secret");
    await act(settle);
    expect(router.state.location.pathname).toBe("/secret");
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Could not check whether you are signed in.");
    await act(async () => {
      [...container.querySelectorAll("button")].find((b) => b.textContent === "Retry")!.click();
      await settle();
    });
    expect(container.textContent).toBe("secret page");
  });
});
