// The pure checkout rules: applying the server's answer to the cart, the per-line notices, the idempotency key
// and the countdown.
import { describe, expect, it } from "vitest";
import { applyQuoteLines, checkoutItems, parseCart, removePurchased, serializeCart } from "../cart/cart.ts";
import { ATTEMPT_STORAGE_KEY, cartFingerprint, createAttemptStore } from "./attemptKey.ts";
import { clockOffsetMs, formatCountdown, remainingMs } from "./countdown.ts";
import { makeCartLine, makeOtherLine, quoteFor } from "./fixtures.ts";
import { clearNotices, hasNotices, mergeAnswer, unavailableOffers } from "./lineStatus.ts";

describe("checkoutItems", () => {
  it("sends offer, quantity and the price the user saw; skips the given offers", () => {
    const lines = [makeCartLine({ quantity: 2 }), makeOtherLine()];
    expect(checkoutItems(lines)).toEqual([
      { offerId: 15, quantity: 2, expectedPriceCents: 1099 },
      { offerId: 27, quantity: 1, expectedPriceCents: 1499 },
    ]);
    expect(checkoutItems(lines, new Set([15]))).toEqual([{ offerId: 27, quantity: 1, expectedPriceCents: 1499 }]);
  });
});

describe("applyQuoteLines", () => {
  it("writes the new price, stock, quantity and display data of a sellable line", () => {
    const line = makeCartLine({ quantity: 4, stock: 6 });
    const [updated] = applyQuoteLines([line], [
      quoteFor(line, { unitPriceCents: 1249, quantity: 2, stock: 2, title: "The Witcher 3 (renamed)", changes: ["price_changed", "quantity_reduced"] }),
    ]);
    expect(updated).toEqual({ ...line, priceCents: 1249, quantity: 2, stock: 2, title: "The Witcher 3 (renamed)" });
  });

  it("keeps an unavailable line exactly as it was, so the stored cart stays valid", () => {
    const line = makeCartLine({ quantity: 2 });
    const result = applyQuoteLines([line], [quoteFor(line, { available: false, quantity: 0, stock: 0, changes: ["unavailable"] })]);
    expect(result).toEqual([line]);
    expect(parseCart(serializeCart(result))).toEqual([line]); // a quantity of 0 would have emptied the whole cart
  });

  it("leaves lines the answer does not mention untouched", () => {
    const a = makeCartLine();
    const b = makeOtherLine();
    expect(applyQuoteLines([a, b], [quoteFor(b, { unitPriceCents: 999 })])).toEqual([a, { ...b, priceCents: 999 }]);
  });
});

describe("removePurchased", () => {
  it("removes fully bought lines and keeps pieces added after the order", () => {
    const a = makeCartLine({ quantity: 1 });
    const b = makeOtherLine({ quantity: 3 });
    const c = makeCartLine({ offerId: 99 });
    expect(removePurchased([a, b, c], [{ offerId: 15, quantity: 1 }, { offerId: 27, quantity: 2 }])).toEqual([
      { ...b, quantity: 1 },
      c,
    ]);
  });
});

describe("mergeAnswer (per-line notices)", () => {
  const line = makeCartLine({ quantity: 4 });
  const sent = checkoutItems([line]);

  it("price change: 'Price updated: €x → €y' with the price the user saw as 'before'", () => {
    const statuses = mergeAnswer({}, sent, [quoteFor(line, { unitPriceCents: 1249, changes: ["price_changed"] })]);
    expect(statuses[15]).toEqual({ unavailable: false, priceNotice: "Price updated: €10.99 → €12.49" });
  });

  it("quantity reduced: 'Only N left – quantity reduced'", () => {
    const statuses = mergeAnswer({}, sent, [quoteFor(line, { quantity: 2, stock: 2, changes: ["quantity_reduced"] })]);
    expect(statuses[15].quantityNotice).toBe("Only 2 left – quantity reduced");
  });

  it("unavailable: marked, and no quantity notice for it", () => {
    const statuses = mergeAnswer({}, sent, [quoteFor(line, { available: false, quantity: 0, changes: ["unavailable", "quantity_reduced"] })]);
    expect(statuses[15]).toEqual({ unavailable: true });
    expect(unavailableOffers(statuses)).toEqual(new Set([15]));
  });

  it("a later 'nothing changed' answer keeps the notice; availability follows the newest answer", () => {
    let statuses = mergeAnswer({}, sent, [quoteFor(line, { unitPriceCents: 1249, changes: ["price_changed"] })]);
    statuses = mergeAnswer(statuses, checkoutItems([{ ...line, priceCents: 1249 }]), [quoteFor({ ...line, priceCents: 1249 })]);
    expect(statuses[15].priceNotice).toBe("Price updated: €10.99 → €12.49");

    statuses = mergeAnswer(statuses, sent, [quoteFor(line, { available: false, changes: ["unavailable"] })]);
    expect(statuses[15].unavailable).toBe(true);
    statuses = mergeAnswer(statuses, sent, [quoteFor(line)]);
    expect(statuses[15].unavailable).toBe(false);
  });

  it("clearNotices forgets the notices of one line but not its availability; hasNotices", () => {
    const statuses = mergeAnswer({}, sent, [quoteFor(line, { unitPriceCents: 1249, changes: ["price_changed"] })]);
    expect(hasNotices(statuses, [15])).toBe(true);
    expect(clearNotices(statuses, 15)[15]).toEqual({ unavailable: false });
    expect(hasNotices(clearNotices(statuses, 15), [15])).toBe(false);
    expect(hasNotices(statuses, [27])).toBe(false);
  });
});

describe("checkout attempt key (idempotency)", () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  }
  const counter = () => {
    let n = 0;
    return () => `key-${++n}`;
  };
  const items = checkoutItems([makeCartLine(), makeOtherLine()]);

  it("the same cart gets the same key (double click, retry after a network error, page reload)", () => {
    const storage = memoryStorage();
    const store = createAttemptStore(storage, counter());
    expect(store.keyFor(items)).toBe("key-1");
    expect(store.keyFor([...items].reverse())).toBe("key-1"); // line order does not matter
    // a reload builds a new store on the same sessionStorage
    expect(createAttemptStore(storage, counter()).keyFor(items)).toBe("key-1");
  });

  it("a changed cart gets a new key; clear() starts a new attempt", () => {
    const store = createAttemptStore(memoryStorage(), counter());
    expect(store.keyFor(items)).toBe("key-1");
    expect(store.keyFor([{ ...items[0], quantity: 2 }, items[1]])).toBe("key-2");
    expect(store.keyFor([{ ...items[0], expectedPriceCents: 1249 }, items[1]])).toBe("key-3");
    store.clear();
    expect(store.keyFor([{ ...items[0], expectedPriceCents: 1249 }, items[1]])).toBe("key-4");
  });

  it("works without storage (blocked) and ignores broken stored data", () => {
    const store = createAttemptStore(null, counter());
    expect(store.keyFor(items)).toBe("key-1");
    expect(store.keyFor(items)).toBe("key-1");

    const storage = memoryStorage();
    storage.data.set(ATTEMPT_STORAGE_KEY, "{not json");
    expect(createAttemptStore(storage, counter()).keyFor(items)).toBe("key-1");
    expect(JSON.parse(storage.data.get(ATTEMPT_STORAGE_KEY)!)).toEqual({ key: "key-1", cart: cartFingerprint(items) });
  });
});

describe("countdown with the server's clock", () => {
  it("corrects for a client clock that is 5 minutes slow", () => {
    const clientNow = Date.parse("2026-11-22T12:00:00Z");
    const offset = clockOffsetMs("2026-11-22T12:05:00Z", clientNow); // the server is 5 min ahead
    expect(offset).toBe(5 * 60_000);
    // reserved until 12:20 server time = 15 minutes left (not 20)
    expect(remainingMs("2026-11-22T12:20:00Z", offset, clientNow)).toBe(15 * 60_000);
    expect(remainingMs("2026-11-22T12:20:00Z", offset, clientNow + 16 * 60_000)).toBe(0);
  });

  it("formats mm:ss, rounding seconds up", () => {
    expect(formatCountdown(15 * 60_000)).toBe("15:00");
    expect(formatCountdown(125_000)).toBe("02:05");
    expect(formatCountdown(400)).toBe("00:01");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5)).toBe("00:00");
  });
});
