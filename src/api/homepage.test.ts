import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client.ts";
import { getBlock, getHomepage } from "./homepage.ts";

vi.mock("./client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client.ts")>()),
  apiFetch: vi.fn(async () => ({ ok: true })),
}));

afterEach(() => vi.mocked(apiFetch).mockClear());

describe("home page API", () => {
  it("getHomepage asks GET /api/homepage", async () => {
    await getHomepage();
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/api/homepage", undefined);
  });

  it("getBlock fetches the endpoint the registry gave", async () => {
    const signal = new AbortController().signal;
    await getBlock("/api/blocks/products/new-releases", { signal });
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith("/api/blocks/products/new-releases", { signal });
  });

  it.each([
    "https://evil.example/api/blocks/hero",
    "//evil.example/api/blocks/hero",
    "/api/orders",
    "/api/blocks/../orders",
    "api/blocks/hero",
    "",
  ])("getBlock refuses %j (only our block API is ever asked)", async (endpoint) => {
    await expect(getBlock(endpoint)).rejects.toThrow("Refusing to load a block");
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
  });
});
