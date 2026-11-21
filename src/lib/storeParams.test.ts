import { describe, expect, it } from "vitest";
import { buildStoreSearch, mergeStoreParams, parseStoreParams } from "./storeParams.ts";
import { buildProductsQuery } from "../api/catalog.ts";

const parse = (search: string) => parseStoreParams(new URLSearchParams(search));

describe("parseStoreParams", () => {
  it("returns an empty object for an empty URL", () => {
    expect(parse("")).toEqual({});
  });

  it("reads every known parameter", () => {
    expect(parse("q=zelda&platform=steam,psn&region=global&minPrice=500&maxPrice=2000&sort=price_asc&page=2")).toEqual({
      q: "zelda",
      platform: ["steam", "psn"],
      region: ["global"],
      minPrice: 500,
      maxPrice: 2000,
      sort: "price_asc",
      page: 2,
    });
  });

  it("keeps minPrice=0 (a real value)", () => {
    expect(parse("minPrice=0")).toEqual({ minPrice: 0 });
  });

  it("drops invalid values instead of passing them on", () => {
    expect(parse("sort=cheapest&page=0&minPrice=abc&maxPrice=-5&page=1.5")).toEqual({});
  });

  it("ignores empty list items and unknown parameters", () => {
    expect(parse("platform=,steam,,&foo=bar")).toEqual({ platform: ["steam"] });
  });

  it("trims the search text and drops it when blank", () => {
    expect(parse("q=%20zelda%20")).toEqual({ q: "zelda" });
    expect(parse("q=%20%20")).toEqual({});
  });
});

describe("buildStoreSearch", () => {
  it("returns an empty string when nothing is set", () => {
    expect(buildStoreSearch({})).toBe("");
  });

  it("uses the same rules as buildProductsQuery (fixed order, commas, no empty values)", () => {
    expect(buildStoreSearch({ page: 2, sort: "price_asc", platform: ["steam", "psn"], region: [] })).toBe(
      "?platform=steam,psn&sort=price_asc&page=2",
    );
  });

  it("puts the search text first and encodes it", () => {
    expect(buildStoreSearch({ q: "half life", sort: "title" })).toBe("?q=half%20life&sort=title");
    expect(buildStoreSearch({ q: "a&b" })).toBe("?q=a%26b");
  });

  it("leaves out a blank search text", () => {
    expect(buildStoreSearch({ q: "   " })).toBe("");
  });

  it("round-trips through parseStoreParams", () => {
    const params = { q: "half life", platform: ["steam"], minPrice: 0, sort: "discount" as const, page: 3 };
    expect(parse(buildStoreSearch(params))).toEqual(params);
  });
});

describe("mergeStoreParams", () => {
  it("applies the patch on top of the current params", () => {
    expect(mergeStoreParams({ platform: ["steam"], sort: "title" }, { sort: "newest" })).toEqual({
      platform: ["steam"],
      sort: "newest",
    });
  });

  it("removes a parameter when the patch sets it to undefined", () => {
    expect(mergeStoreParams({ platform: ["steam"], sort: "title" }, { platform: undefined })).toEqual({
      sort: "title",
    });
  });

  it("goes back to page 1 when a filter changes", () => {
    expect(mergeStoreParams({ platform: ["steam"], page: 3 }, { region: ["global"] })).toEqual({
      platform: ["steam"],
      region: ["global"],
    });
  });

  it("keeps the page when only the page changes", () => {
    expect(mergeStoreParams({ platform: ["steam"], page: 3 }, { page: 4 })).toEqual({
      platform: ["steam"],
      page: 4,
    });
  });

  it("keeps an explicit page that comes together with a filter change", () => {
    expect(mergeStoreParams({ page: 3 }, { sort: "title", page: 2 })).toEqual({ sort: "title", page: 2 });
  });
});

// S12: a hand-typed URL must never make the page send something the API answers with 400.
describe("parseStoreParams: sanitizing hand-typed URLs (S12)", () => {
  it("falls back to the default for an unknown sort", () => {
    expect(parse("sort=foo")).toEqual({});
  });

  it("drops a price that is not a whole number of cents", () => {
    expect(parse("minPrice=abc&maxPrice=12.5")).toEqual({});
    expect(parse("minPrice=-1")).toEqual({});
    expect(parse("minPrice=1e3")).toEqual({});
  });

  it("drops a number too big to be exact (the API would answer 400)", () => {
    expect(parse("minPrice=99999999999999999999999")).toEqual({});
  });

  it("drops a page that is 0, negative, not a number or above the API limit", () => {
    expect(parse("page=0")).toEqual({});
    expect(parse("page=abc")).toEqual({});
    expect(parse("page=10001")).toEqual({});
    expect(parse("page=10000")).toEqual({ page: 10000 });
  });

  it("drops BOTH prices when min is greater than max", () => {
    expect(parse("minPrice=2000&maxPrice=500&sort=title")).toEqual({ sort: "title" });
    expect(parse("minPrice=500&maxPrice=500")).toEqual({ minPrice: 500, maxPrice: 500 });
  });

  it("removes repeated slugs and keeps at most 20 (the API limit)", () => {
    expect(parse("platform=steam,steam,psn")).toEqual({ platform: ["steam", "psn"] });
    const many = Array.from({ length: 30 }, (_, i) => `p${i}`).join(",");
    expect(parse(`platform=${many}`).platform).toHaveLength(20);
  });

  it("only produces API requests that the server accepts (a messy URL gives a clean query)", () => {
    const params = parse("platform=steam,,steam&sort=foo&minPrice=abc&page=0&maxPrice=700&q=x");
    const { q, ...filters } = params;
    expect(q).toBe("x");
    expect(buildProductsQuery(filters)).toBe("?platform=steam&maxPrice=700");
  });
});
