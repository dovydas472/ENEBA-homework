import { afterEach, describe, expect, it, vi } from "vitest";
import { authErrorMessage, displayName, getCurrentUser, login, logout, register, signInAsDemo } from "./auth.ts";
import { ApiError } from "./client.ts";

const me = { id: 1, email: "me@example.com", isDemo: false };

function mockFetch(response: () => Response) {
  const fake = vi.fn<typeof fetch>(async () => response());
  vi.stubGlobal("fetch", fake);
  return fake;
}

afterEach(() => vi.unstubAllGlobals());

describe("getCurrentUser", () => {
  it("returns the user from GET /api/auth/me", async () => {
    const fake = mockFetch(() => new Response(JSON.stringify({ user: me }), { status: 200 }));
    await expect(getCurrentUser()).resolves.toEqual(me);
    expect(fake.mock.calls[0][0]).toBe("/api/auth/me");
  });

  it("turns 401 into null: signed out is a normal answer, not an error", async () => {
    mockFetch(() => new Response('{"error":"not signed in"}', { status: 401 }));
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("still throws on 5xx: 'we do not know' is not 'signed out'", async () => {
    mockFetch(() => new Response('{"error":"service temporarily unavailable"}', { status: 503 }));
    await expect(getCurrentUser()).rejects.toMatchObject({ code: "http", status: 503 });
  });
});

describe("sign-in requests", () => {
  it.each([
    ["login", () => login({ email: "me@example.com", password: "pw 12345" }), "/api/auth/login"],
    ["register", () => register({ email: "me@example.com", password: "pw 12345" }), "/api/auth/register"],
  ])("%s POSTs the credentials as JSON and returns the user", async (_name, call, path) => {
    const fake = mockFetch(() => new Response(JSON.stringify({ user: me }), { status: 200 }));
    await expect(call()).resolves.toEqual(me);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe(path);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual({ email: "me@example.com", password: "pw 12345" });
  });

  it("demo POSTs without a body", async () => {
    const demo = { id: 2, email: "demo-1@demo.invalid", isDemo: true };
    const fake = mockFetch(() => new Response(JSON.stringify({ user: demo }), { status: 201 }));
    await expect(signInAsDemo()).resolves.toEqual(demo);
    const [url, init] = fake.mock.calls[0];
    expect(url).toBe("/api/auth/demo");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
  });

  it("logout accepts the empty 204 answer", async () => {
    const fake = mockFetch(() => new Response(null, { status: 204 }));
    await expect(logout()).resolves.toBeUndefined();
    expect(fake.mock.calls[0][0]).toBe("/api/auth/logout");
  });
});

describe("authErrorMessage", () => {
  const http = (status: number, error?: string) => new ApiError("http", `HTTP ${status}`, status, error ? { error } : undefined);

  it.each([
    [400, "Enter a valid email address"],
    [401, "Invalid email or password"],
    [409, "An account with this email already exists"],
    [429, "Too many failed sign-in attempts. Try again later."],
  ])("shows the server's own text for %i", (status, text) => {
    expect(authErrorMessage(http(status, text))).toBe(text);
  });

  it("never shows a raw 5xx or unknown message", () => {
    expect(authErrorMessage(http(503, "service temporarily unavailable"))).toBe("Something went wrong. Please try again.");
    expect(authErrorMessage(http(403, "cross-origin request blocked"))).toBe("Something went wrong. Please try again.");
    expect(authErrorMessage(http(401))).toBe("Something went wrong. Please try again.");
    expect(authErrorMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
  });

  it("explains a network problem or a timeout", () => {
    const text = "Could not reach the server. Check your connection and try again.";
    expect(authErrorMessage(new ApiError("network", "Network error"))).toBe(text);
    expect(authErrorMessage(new ApiError("timeout", "Request timed out"))).toBe(text);
  });
});

describe("displayName", () => {
  it("is the email, or 'Demo user' for a demo account", () => {
    expect(displayName(me)).toBe("me@example.com");
    expect(displayName({ id: 2, email: "demo-1@demo.invalid", isDemo: true })).toBe("Demo user");
  });
});
