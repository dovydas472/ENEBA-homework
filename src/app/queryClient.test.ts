import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client.ts";
import { createQueryClient, shouldRetry } from "./queryClient.ts";

describe("createQueryClient defaults", () => {
  const defaults = createQueryClient().getDefaultOptions().queries;

  it("treats data as fresh for a while, so going back to a page does not refetch or flicker", () => {
    expect(defaults?.staleTime).toBeGreaterThanOrEqual(30_000);
  });

  it("does not refetch every time the browser tab gets focus", () => {
    expect(defaults?.refetchOnWindowFocus).toBe(false);
  });

  it("uses our retry rule", () => {
    expect(defaults?.retry).toBe(shouldRetry);
  });
});

describe("shouldRetry", () => {
  it("retries a network error once", () => {
    const error = new ApiError("network", "Network error");
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(false);
  });

  it("retries a server error (5xx) once, e.g. the database is waking up", () => {
    const error = new ApiError("http", "HTTP 503", 503);
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(false);
  });

  it("does not retry a client error (4xx): asking again gives the same answer", () => {
    expect(shouldRetry(0, new ApiError("http", "HTTP 404", 404))).toBe(false);
    expect(shouldRetry(0, new ApiError("http", "HTTP 400", 400))).toBe(false);
  });

  it("does not retry a timeout (the user would wait twice as long) or a parse error", () => {
    expect(shouldRetry(0, new ApiError("timeout", "Request timed out"))).toBe(false);
    expect(shouldRetry(0, new ApiError("parse", "Response is not valid JSON", 200))).toBe(false);
  });

  it("does not retry an unknown error (probably a bug in our code)", () => {
    expect(shouldRetry(0, new TypeError("boom"))).toBe(false);
  });
});
