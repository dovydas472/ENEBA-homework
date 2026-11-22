// The cart rules (pure functions): limits, merging, removing, totals and reading stored data.
import { describe, expect, it } from "vitest";
import type { ProductDetail } from "../../api/types.ts";
import { makeItem } from "../store/fixtures.ts";
import {
  addItem,
  cartCount,
  cartTotalCents,
  itemFromListing,
  itemFromOffer,
  maxQuantity,
  parseCart,
  removeLine,
  serializeCart,
  setQuantity,
  type CartItem,
  type CartLine,
} from "./cart.ts";

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    offerId: 15,
    productSlug: "the-witcher-3-wild-hunt-steam-global",
    title: "The Witcher 3: Wild Hunt",
    edition: "Standard",
    platformName: "Steam",
    regionName: "GLOBAL",
    coverUrl: "https://images.example/witcher.jpg",
    sellerName: "Retro Ridge",
    priceCents: 1099,
    stock: 6,
    ...overrides,
  };
}
const line = (overrides: Partial<CartLine> = {}): CartLine => ({ ...makeCartItem(overrides), quantity: 1, ...overrides });

describe("maxQuantity", () => {
  it("is min(stock, 5)", () => {
    expect(maxQuantity(6)).toBe(5);
    expect(maxQuantity(5)).toBe(5);
    expect(maxQuantity(2)).toBe(2);
    expect(maxQuantity(0)).toBe(0);
  });
});

describe("addItem", () => {
  it("adds a new offer as a new line with quantity 1", () => {
    const { lines, result } = addItem([], makeCartItem());
    expect(result).toBe("added");
    expect(lines).toEqual([line()]);
  });

  it("the same offer again: quantity +1 (C2), no second line", () => {
    const { lines, result } = addItem([line()], makeCartItem());
    expect(result).toBe("increased");
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });

  it("another offer of the same product is another line (C1)", () => {
    const { lines } = addItem([line()], makeCartItem({ offerId: 16, sellerName: "Quest Depot", priceCents: 1299 }));
    expect(lines.map((l) => [l.offerId, l.quantity])).toEqual([
      [15, 1],
      [16, 1],
    ]);
  });

  it("stops at 5 even when the seller has more", () => {
    let lines: CartLine[] = [];
    for (let i = 0; i < 5; i++) lines = addItem(lines, makeCartItem({ stock: 9 })).lines;
    expect(lines[0].quantity).toBe(5);
    const sixth = addItem(lines, makeCartItem({ stock: 9 }));
    expect(sixth.result).toBe("max");
    expect(sixth.lines[0].quantity).toBe(5);
  });

  it("stops at the stock when it is below 5", () => {
    const first = addItem([], makeCartItem({ stock: 2 }));
    const second = addItem(first.lines, makeCartItem({ stock: 2 }));
    const third = addItem(second.lines, makeCartItem({ stock: 2 }));
    expect([first.result, second.result, third.result]).toEqual(["added", "increased", "max"]);
    expect(third.lines[0].quantity).toBe(2);
  });

  it("refreshes the display data with the newer values and lowers the quantity when the stock dropped", () => {
    const { lines, result } = addItem([line({ quantity: 4, priceCents: 1099 })], makeCartItem({ stock: 3, priceCents: 999 }));
    expect(result).toBe("max");
    expect(lines[0]).toMatchObject({ quantity: 3, stock: 3, priceCents: 999 });
  });

  it("an offer without stock is never added and leaves an existing line as it was", () => {
    expect(addItem([], makeCartItem({ stock: 0 }))).toEqual({ lines: [], result: "max" });
    const existing = [line({ quantity: 2 })];
    expect(addItem(existing, makeCartItem({ stock: 0 })).lines).toEqual(existing);
  });

  it("does not change the array it was given", () => {
    const before = [line()];
    const copy = structuredClone(before);
    addItem(before, makeCartItem());
    addItem(before, makeCartItem({ offerId: 99 }));
    expect(before).toEqual(copy);
  });
});

describe("setQuantity / removeLine", () => {
  const lines = [line({ offerId: 1, stock: 3 }), line({ offerId: 2, stock: 9 })];

  it("sets the quantity of one line only", () => {
    expect(setQuantity(lines, 2, 4).map((l) => l.quantity)).toEqual([1, 4]);
  });

  it("keeps it between 1 and min(stock, 5)", () => {
    expect(setQuantity(lines, 1, 10)[0].quantity).toBe(3);
    expect(setQuantity(lines, 2, 10)[1].quantity).toBe(5);
    expect(setQuantity(lines, 2, 0)[1].quantity).toBe(1);
    expect(setQuantity(lines, 2, -4)[1].quantity).toBe(1);
    expect(setQuantity(lines, 2, 2.7)[1].quantity).toBe(2);
  });

  it("ignores a non-number and an unknown offer", () => {
    expect(setQuantity(lines, 2, Number.NaN)).toEqual(lines);
    expect(setQuantity(lines, 404, 3)).toEqual(lines);
  });

  it("removeLine drops only that offer", () => {
    expect(removeLine(lines, 1).map((l) => l.offerId)).toEqual([2]);
    expect(removeLine(lines, 404)).toEqual(lines);
  });
});

describe("cartCount / cartTotalCents", () => {
  it("count = pieces, total = integer cents", () => {
    const lines = [line({ offerId: 1, quantity: 2, priceCents: 1099 }), line({ offerId: 2, quantity: 1, priceCents: 1 })];
    expect(cartCount(lines)).toBe(3);
    expect(cartTotalCents(lines)).toBe(2199);
    expect(cartCount([])).toBe(0);
    expect(cartTotalCents([])).toBe(0);
  });
});

describe("parseCart (stored data)", () => {
  it("reads back what serializeCart wrote", () => {
    const lines = [line({ quantity: 2 }), line({ offerId: 16, coverUrl: null })];
    expect(parseCart(serializeCart(lines))).toEqual(lines);
  });

  it.each([
    ["nothing stored", null],
    ["empty text", ""],
    ["not JSON", "{oops"],
    ["not a list", '{"offerId":15}'],
    ["a line with a missing field", JSON.stringify([{ offerId: 15, quantity: 1 }])],
    ["a price that is not integer cents", JSON.stringify([{ ...line(), priceCents: 10.99 }])],
    ["quantity 0", JSON.stringify([{ ...line(), quantity: 0 }])],
    ["quantity above the limit", JSON.stringify([{ ...line(), stock: 2, quantity: 3 }])],
    ["the same offer twice", JSON.stringify([line(), line()])],
    ["one good and one broken line", JSON.stringify([line(), null])],
  ])("%s -> empty cart, no crash", (_name, raw) => {
    expect(parseCart(raw)).toEqual([]);
  });

  it("keeps only the known fields", () => {
    const stored = JSON.stringify([{ ...line(), extra: "<script>" }]);
    expect(parseCart(stored)[0]).not.toHaveProperty("extra");
  });
});

describe("building a CartItem", () => {
  it("itemFromListing uses the card's cheapest offer", () => {
    expect(itemFromListing(makeItem())).toEqual(makeCartItem({ regionName: "Global" }));
  });

  it("itemFromListing returns null for an out-of-stock card", () => {
    expect(itemFromListing(makeItem({ inStock: false, priceCents: null, cheapestOffer: null }))).toBeNull();
  });

  it("itemFromOffer takes the product from the page and seller, price and stock from the offer", () => {
    const detail = {
      product: { slug: "gta-v-steam-global", edition: "Premium Edition", platform: { slug: "steam", name: "Steam" }, region: { slug: "europe", name: "EUROPE" } },
      game: { title: "Grand Theft Auto V", coverUrl: null },
    } as ProductDetail;
    const offer = { offerId: 7, priceCents: 1499, stock: 2, seller: { name: "Byte Bazaar" } } as ProductDetail["offers"][number];
    expect(itemFromOffer(detail, offer)).toEqual({
      offerId: 7,
      productSlug: "gta-v-steam-global",
      title: "Grand Theft Auto V",
      edition: "Premium Edition",
      platformName: "Steam",
      regionName: "EUROPE",
      coverUrl: null,
      sellerName: "Byte Bazaar",
      priceCents: 1499,
      stock: 2,
    });
  });
});
