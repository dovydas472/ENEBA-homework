// Unit tests for the catalog API layer. fetch is replaced with a fake, so no server is needed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProductsQuery, getProduct, getProducts, getSuggestions } from "./catalog.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Replace fetch with a fake that answers `{}` and return it (to inspect the URL). */
function mockFetch() {
  const fake = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fake);
  return fake;
}

describe("buildProductsQuery", () => {
  it("returns an empty string when there is nothing to send", () => {
    expect(buildProductsQuery({})).toBe("");
  });

  it("joins multi-select values with commas", () => {
    expect(buildProductsQuery({ platform: ["steam", "psn"], region: ["europe"] })).toBe(
      "?platform=steam,psn&region=europe",
    );
  });

  it("omits undefined, null, empty strings and empty arrays", () => {
    expect(
      buildProductsQuery({
        platform: [],
        region: undefined,
        minPrice: undefined,
        sort: undefined,
        page: undefined,
      }),
    ).toBe("");
  });

  it("keeps 0: a price of 0 is a real value, not 'missing'", () => {
    expect(buildProductsQuery({ minPrice: 0 })).toBe("?minPrice=0");
  });

  it("writes every parameter in a fixed order (stable URLs help the CDN cache)", () => {
    expect(
      buildProductsQuery({
        pageSize: 24,
        page: 2,
        sort: "price_asc",
        maxPrice: 2000,
        minPrice: 500,
        region: ["global"],
        platform: ["steam"],
      }),
    ).toBe("?platform=steam&region=global&minPrice=500&maxPrice=2000&sort=price_asc&page=2&pageSize=24");
  });

  it("encodes special characters in each value but keeps the commas between values", () => {
    expect(buildProductsQuery({ platform: ["a b", "c&d"] })).toBe("?platform=a%20b,c%26d");
  });

  it("skips empty slugs inside a list", () => {
    expect(buildProductsQuery({ platform: ["steam", ""] })).toBe("?platform=steam");
  });

  it("omits a list that only contains empty slugs", () => {
    expect(buildProductsQuery({ platform: [""], region: ["", ""] })).toBe("");
  });

  it("puts q first and omits an empty q", () => {
    expect(buildProductsQuery({ sort: "price_asc", q: "witcher" })).toBe("?q=witcher&sort=price_asc");
    expect(buildProductsQuery({ q: "" })).toBe("");
  });
});

describe("getSuggestions", () => {
  it("calls /api/search/suggest with the encoded text", async () => {
    const fake = mockFetch();
    await getSuggestions("gta 5");
    await getSuggestions("100%/ü?");
    expect(fake.mock.calls[0][0]).toBe("/api/search/suggest?q=gta%205");
    expect(fake.mock.calls[1][0]).toBe("/api/search/suggest?q=100%25%2F%C3%BC%3F");
  });

  it("returns the parsed body", async () => {
    const body = {
      items: [
        {
          gameTitle: "Grand Theft Auto V",
          productSlug: "grand-theft-auto-v-steam-global",
          edition: "Standard",
          platform: { slug: "steam", name: "Steam" },
          region: { slug: "global", name: "GLOBAL" },
          coverUrl: null,
          priceCents: 1199,
          inStock: true,
          matchedAlias: "GTA 5",
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status: 200 })));
    await expect(getSuggestions("gta 5")).resolves.toEqual(body);
  });

  it("rejects with the server's 400 for a too short text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: "q must be 2 to 100 characters long" }), { status: 400 })),
    );
    await expect(getSuggestions("a")).rejects.toMatchObject({ code: "http", status: 400 });
  });
});

describe("getProducts / getProduct", () => {
  it("getProducts calls /api/products with the query string", async () => {
    const fake = mockFetch();
    await getProducts({ platform: ["psn"], sort: "price_asc" });
    expect(fake.mock.calls[0][0]).toBe("/api/products?platform=psn&sort=price_asc");
  });

  it("getProducts without params calls the bare path", async () => {
    const fake = mockFetch();
    await getProducts();
    expect(fake.mock.calls[0][0]).toBe("/api/products");
  });

  it("getProducts sends the search text first and encodes it", async () => {
    const fake = mockFetch();
    await getProducts({ q: "gta 5 & co", platform: ["steam"], sort: "relevance" });
    expect(fake.mock.calls[0][0]).toBe("/api/products?q=gta%205%20%26%20co&platform=steam&sort=relevance");
  });

  it("getProduct encodes the slug", async () => {
    const fake = mockFetch();
    await getProduct("the-witcher-3-wild-hunt-steam-global");
    await getProduct("odd slug/with?chars");
    expect(fake.mock.calls[0][0]).toBe("/api/products/the-witcher-3-wild-hunt-steam-global");
    expect(fake.mock.calls[1][0]).toBe("/api/products/odd%20slug%2Fwith%3Fchars");
  });
});
