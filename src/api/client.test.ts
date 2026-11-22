// Unit tests for apiFetch. fetch is replaced with a fake, so no server is needed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./client.ts";

/** Replace the global fetch with a fake and return it (to inspect the calls). */
function mockFetch(impl: (input: string, init: RequestInit) => Promise<Response>) {
  const fake = vi.fn(impl);
  vi.stubGlobal("fetch", fake);
  return fake;
}

/** Run apiFetch and return the error it throws (fails the test if it does not throw). */
async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("expected apiFetch to throw");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("apiFetch", () => {
  it("returns the parsed JSON of a 2xx response and asks for JSON", async () => {
    const fake = mockFetch(async () => new Response('{"status":"ok"}', { status: 200 }));

    const data = await apiFetch<{ status: string }>("/api/health");

    expect(data).toEqual({ status: "ok" });
    expect(fake).toHaveBeenCalledTimes(1);
    const [path, init] = fake.mock.calls[0];
    expect(path).toBe("/api/health");
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
  });

  it("throws ApiError(http) with status and parsed body on a non-2xx response", async () => {
    mockFetch(async () => new Response('{"db":"error"}', { status: 503 }));

    const err = await catchError(apiFetch("/api/health"));

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.code).toBe("http");
    expect(apiErr.status).toBe(503);
    expect(apiErr.body).toEqual({ db: "error" });
  });

  it("throws ApiError(http) with an empty body when the error response is not JSON", async () => {
    mockFetch(async () => new Response("<html>Bad gateway</html>", { status: 502 }));

    const apiErr = (await catchError(apiFetch("/api/x"))) as ApiError;

    expect(apiErr.code).toBe("http");
    expect(apiErr.status).toBe(502);
    expect(apiErr.body).toBeUndefined();
  });

  it("resolves with undefined for 204 No Content (no body to parse)", async () => {
    mockFetch(async () => new Response(null, { status: 204 }));

    await expect(apiFetch("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("throws ApiError(parse) when a 2xx response is not valid JSON", async () => {
    mockFetch(async () => new Response("not json", { status: 200 }));

    const apiErr = (await catchError(apiFetch("/api/x"))) as ApiError;

    expect(apiErr.code).toBe("parse");
    expect(apiErr.status).toBe(200);
  });

  it("throws ApiError(network) when the request never gets an answer", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    const apiErr = (await catchError(apiFetch("/api/x"))) as ApiError;

    expect(apiErr).toBeInstanceOf(ApiError);
    expect(apiErr.code).toBe("network");
    expect(apiErr.status).toBe(0);
  });

  it("throws ApiError(timeout) when there is no answer within timeoutMs", async () => {
    vi.useFakeTimers();
    // A fetch that never answers; it only fails when its signal is aborted (like the real one).
    mockFetch(
      (_path, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );

    const pending = catchError(apiFetch("/api/slow", { timeoutMs: 100 }));
    await vi.advanceTimersByTimeAsync(100);
    const apiErr = (await pending) as ApiError;

    expect(apiErr).toBeInstanceOf(ApiError);
    expect(apiErr.code).toBe("timeout");
  });

  it("rethrows the original AbortError (not an ApiError) when the caller aborts", async () => {
    mockFetch(
      (_path, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const controller = new AbortController();

    const pending = catchError(apiFetch("/api/x", { signal: controller.signal }));
    controller.abort();
    const err = await pending;

    expect(err).not.toBeInstanceOf(ApiError);
    expect((err as DOMException).name).toBe("AbortError");
  });
});
