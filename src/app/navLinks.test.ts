import { describe, expect, it } from "vitest";
import { parseStoreParams } from "../lib/storeParams.ts";
import { NAV_LINKS } from "./navLinks.ts";

describe("NAV_LINKS", () => {
  it("starts with the Store and then four platform shortcuts", () => {
    expect(NAV_LINKS.map((link) => link.label)).toEqual(["Store", "Steam", "PSN", "Xbox Live", "Nintendo eShop"]);
    expect(NAV_LINKS[0].to).toBe("/store");
  });

  it("every platform link is a Store URL that the Store page reads back as exactly that platform filter", () => {
    const platforms = NAV_LINKS.slice(1).map((link) => {
      const url = new URL(link.to, "http://localhost");
      expect(url.pathname).toBe("/store");
      return parseStoreParams(url.searchParams);
    });
    expect(platforms).toEqual([
      { platform: ["steam"] },
      { platform: ["psn"] },
      { platform: ["xbox-live"] },
      { platform: ["nintendo-eshop"] },
    ]);
  });
});
