// @vitest-environment jsdom
// The sign-in and sign-up pages inside the REAL app routes, with apiFetch replaced by a fake auth server.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../api/auth.ts";
import { apiFetch } from "../../api/client.ts";
import { routes } from "../../app/routes.ts";
import { render, setControlValue } from "../../test-utils.tsx";
import { fakeAuthServer, httpError, newFakeAuthState, type FakeAuthState } from "./fakeAuthServer.ts";

vi.mock("../../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client.ts")>()),
  apiFetch: vi.fn(),
}));

const fakeApi = vi.mocked(apiFetch);
const me: User = { id: 1, email: "me@example.com", isDemo: false };
const demoUser: User = { id: 2, email: "demo-0123456789abcdef@demo.invalid", isDemo: true };
let server: FakeAuthState;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  window.scrollTo = vi.fn() as never; // jsdom has no scrolling; the layout's ScrollRestoration calls it
  server = newFakeAuthState();
  fakeApi.mockReset();
  fakeApi.mockImplementation(fakeAuthServer(server));
});
afterEach(() => cleanup?.());

const settle = async () => {
  for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const flush = () => act(settle);

async function mount(url: string) {
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
/** The input whose <label> has this text. */
const field = (label: string) => {
  const l = [...document.querySelectorAll("main label")].find((x) => x.textContent === label) as HTMLLabelElement;
  return document.getElementById(l.htmlFor) as HTMLInputElement;
};
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("main button")].find((b) => b.textContent === text)!;
const describedText = (input: HTMLElement) =>
  (input.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
    .join(" | ");
const alertText = () => $("main [role=alert]")?.textContent;
/** All live "status" regions together (the toast is one of them). */
const statusText = () => [...document.querySelectorAll("[role=status]")].map((e) => e.textContent).join(" | ");
const posts = () => server.requests.filter((r) => r.key.startsWith("POST"));

function type(label: string, value: string) {
  setControlValue(field(label), value);
}
async function submit() {
  await act(async () => {
    ($("main form") as HTMLFormElement).requestSubmit();
    await settle();
  });
}
async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await settle();
  });
}

describe("sign-in page", () => {
  it("has labelled fields with the right autocomplete, the demo button first and a link to sign-up keeping next", async () => {
    await mount("/login?next=%2Forders");
    expect($("main h1")?.textContent).toBe("Sign in");
    expect(document.title).toBe("Sign in – EneHomeworkBa");
    expect(field("Email").type).toBe("email");
    expect(field("Email").autocomplete).toBe("email");
    expect(field("Password").type).toBe("password");
    expect(field("Password").autocomplete).toBe("current-password");
    // The demo button comes before the form.
    const demo = button("Sign in as demo user");
    expect(demo.compareDocumentPosition($("main form")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect($("main a[href='/register?next=%2Forders']")?.textContent).toBe("Create an account");
  });

  it("an empty submit shows both messages, focuses the email field and sends nothing", async () => {
    await mount("/login");
    await submit();
    expect(describedText(field("Email"))).toBe("Enter your email");
    expect(describedText(field("Password"))).toBe("Enter your password");
    expect(field("Email").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Email"));
    expect(posts()).toEqual([]);
  });

  it("validates a field when the user leaves it, and clears the message once it is fixed", async () => {
    await mount("/login");
    type("Email", "jon");
    expect(describedText(field("Email"))).toBe(""); // no red text while typing
    act(() => field("Email").dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(describedText(field("Email"))).toBe("Enter a valid email address");
    type("Email", "jon@example.com");
    expect(describedText(field("Email"))).toBe("");
    expect(field("Email").hasAttribute("aria-invalid")).toBe(false);
  });

  it("a wrong password shows the server's generic message and stays on the page", async () => {
    server.handlers["POST /api/auth/login"] = () => {
      throw httpError(401, "Invalid email or password");
    };
    const { router } = await mount("/login");
    type("Email", "me@example.com");
    type("Password", "wrong password");
    await submit();
    expect(alertText()).toBe("Invalid email or password");
    expect(urlOf(router)).toBe("/login");
  });

  it("too many attempts (429) shows the rate-limit message", async () => {
    server.handlers["POST /api/auth/login"] = () => {
      throw httpError(429, "Too many failed sign-in attempts. Try again later.");
    };
    await mount("/login");
    type("Email", "me@example.com");
    type("Password", "x");
    await submit();
    expect(alertText()).toBe("Too many failed sign-in attempts. Try again later.");
  });

  it("a server error shows a generic text, never the raw one", async () => {
    server.handlers["POST /api/auth/login"] = () => {
      throw httpError(503, "service temporarily unavailable");
    };
    await mount("/login");
    type("Email", "me@example.com");
    type("Password", "my password 1");
    await submit();
    expect(alertText()).toBe("Something went wrong. Please try again.");
  });

  it("success sends the trimmed email, goes to `next` and shows the account menu", async () => {
    server.handlers["POST /api/auth/login"] = () => ({ user: me });
    const { router } = await mount("/login?next=%2Fcart");
    type("Email", "  me@example.com ");
    type("Password", "my password 1");
    await submit();
    expect(posts()).toEqual([{ key: "POST /api/auth/login", body: { email: "me@example.com", password: "my password 1" } }]);
    expect(urlOf(router)).toBe("/cart");
    expect($("header button[aria-label='Account: me@example.com']")).not.toBeNull();
    expect(statusText()).toContain("Signed in as me@example.com");
  });

  it.each([["%2F%2Fevil.example"], ["https%3A%2F%2Fevil.example"], ["%2F%5Cevil.example"]])(
    "an unsafe next (%s) goes to / instead",
    async (next) => {
      server.handlers["POST /api/auth/login"] = () => ({ user: me });
      const { router } = await mount(`/login?next=${next}`);
      type("Email", "me@example.com");
      type("Password", "my password 1");
      await submit();
      expect(urlOf(router)).toBe("/");
    },
  );

  it("shows the loading state and ignores a second submit while the request runs", async () => {
    let finish!: (value: unknown) => void;
    server.handlers["POST /api/auth/login"] = () => new Promise((resolve) => (finish = resolve));
    const { router } = await mount("/login?next=%2Fcart");
    type("Email", "me@example.com");
    type("Password", "my password 1");
    await submit();
    expect(button("Sign in").getAttribute("aria-busy")).toBe("true");
    await submit();
    expect(posts()).toHaveLength(1);
    await act(async () => {
      finish({ user: me });
      await settle();
    });
    expect(urlOf(router)).toBe("/cart");
  });

  it("the eye button shows and hides the password", async () => {
    await mount("/login");
    const toggle = $<HTMLButtonElement>("main button[aria-label='Show password']")!;
    await click(toggle);
    expect(field("Password").type).toBe("text");
    expect(toggle.getAttribute("aria-label")).toBe("Hide password");
    expect(toggle.type).toBe("button"); // must not submit the form
    await click(toggle);
    expect(field("Password").type).toBe("password");
  });

  it("'Sign in as demo user' creates a demo account and goes to next", async () => {
    server.handlers["POST /api/auth/demo"] = () => ({ user: demoUser });
    const { router } = await mount("/login?next=%2Fcart");
    await click(button("Sign in as demo user"));
    expect(posts()).toEqual([{ key: "POST /api/auth/demo", body: undefined }]);
    expect(urlOf(router)).toBe("/cart");
    expect($("header button[aria-label='Account: Demo user']")).not.toBeNull();
  });

  it("an already signed-in visitor is sent on to next", async () => {
    server.user = me;
    const { router } = await mount("/login?next=%2Fcart");
    expect(urlOf(router)).toBe("/cart");
  });
});

describe("sign-up page", () => {
  it("uses new-password, shows the length hint and links back to sign-in keeping next", async () => {
    await mount("/register?next=%2Forders");
    expect($("main h1")?.textContent).toBe("Create account");
    expect(field("Password").autocomplete).toBe("new-password");
    expect(describedText(field("Password"))).toBe("8–128 characters");
    expect($("main a[href='/login?next=%2Forders']")?.textContent).toBe("Sign in");
    expect(button("Sign in as demo user")).toBeDefined();
  });

  it("checks the password length before sending", async () => {
    await mount("/register");
    type("Email", "new@example.com");
    type("Password", "1234567");
    await submit();
    expect(describedText(field("Password"))).toBe("8–128 characters | Password must be at least 8 characters");
    expect(document.activeElement).toBe(field("Password"));
    expect(posts()).toEqual([]);
  });

  it("a taken email shows the 409 message", async () => {
    server.handlers["POST /api/auth/register"] = () => {
      throw httpError(409, "An account with this email already exists");
    };
    await mount("/register");
    type("Email", "taken@example.com");
    type("Password", "my password 1");
    await submit();
    expect(alertText()).toBe("An account with this email already exists");
  });

  it("success signs the new user in and goes home when there is no next", async () => {
    server.handlers["POST /api/auth/register"] = () => ({ user: { ...me, email: "new@example.com" } });
    const { router } = await mount("/register");
    type("Email", "new@example.com");
    type("Password", "my password 1");
    await submit();
    expect(urlOf(router)).toBe("/");
    expect($("header button[aria-label='Account: new@example.com']")).not.toBeNull();
  });
});
