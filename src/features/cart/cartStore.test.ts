// @vitest-environment jsdom
// The cart store: saving to storage, reading it back, broken storage, and the sync between browser tabs.
import { describe, expect, it, vi } from "vitest";
import { CART_STORAGE_KEY, type CartItem } from "./cart.ts";
import { createCartStore } from "./cartStore.ts";

/** An in-memory stand-in for localStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  offerId: 15,
  productSlug: "the-witcher-3-wild-hunt-steam-global",
  title: "The Witcher 3: Wild Hunt",
  edition: "Standard",
  platformName: "Steam",
  regionName: "GLOBAL",
  coverUrl: null,
  sellerName: "Retro Ridge",
  priceCents: 1099,
  stock: 6,
  ...overrides,
});

/** What another tab does: write localStorage, which fires `storage` in THIS tab. */
function otherTabWrites(storage: ReturnType<typeof fakeStorage>, value: string | null, key: string | null = CART_STORAGE_KEY) {
  if (key && value !== null) storage.data.set(key, value);
  window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
}

describe("cartStore", () => {
  it("saves every change under the versioned key cart:v1", () => {
    const storage = fakeStorage();
    const store = createCartStore(storage, window);
    expect(store.add(item())).toBe("added");
    expect(JSON.parse(storage.data.get("cart:v1")!)).toEqual([{ ...item(), quantity: 1 }]);

    store.setQuantity(15, 3);
    expect(JSON.parse(storage.data.get("cart:v1")!)[0].quantity).toBe(3);
    store.remove(15);
    expect(storage.data.get("cart:v1")).toBe("[]");
  });

  it("starts with what is stored (a reload keeps the cart)", () => {
    const storage = fakeStorage();
    createCartStore(storage, window).add(item());
    const reloaded = createCartStore(storage, window);
    expect(reloaded.getSnapshot()).toEqual([{ ...item(), quantity: 1 }]);
  });

  it("corrupt stored data -> empty cart; the next change overwrites it", () => {
    const storage = fakeStorage({ "cart:v1": "{not json" });
    const store = createCartStore(storage, window);
    expect(store.getSnapshot()).toEqual([]);
    store.add(item());
    expect(JSON.parse(storage.data.get("cart:v1")!)).toHaveLength(1);
  });

  it("ignores data of another format version (another key)", () => {
    const storage = fakeStorage({ cart: JSON.stringify([{ ...item(), quantity: 1 }]), "cart:v0": "[1,2,3]" });
    expect(createCartStore(storage, window).getSnapshot()).toEqual([]);
  });

  it("works in memory when the storage throws (blocked or full) and when there is none", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const store = createCartStore(broken, window);
    expect(store.getSnapshot()).toEqual([]);
    expect(store.add(item())).toBe("added");
    expect(store.getSnapshot()).toHaveLength(1);

    const none = createCartStore(null, null);
    none.add(item());
    expect(none.getSnapshot()).toHaveLength(1);
  });

  it("returns the same array until something changes (needed by useSyncExternalStore)", () => {
    const store = createCartStore(fakeStorage(), window);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.add(item());
    expect(store.getSnapshot()).not.toBe(first);
  });

  it("tells the subscribers about every change, and stops after unsubscribe", () => {
    const store = createCartStore(fakeStorage(), window);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.add(item());
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.add(item());
    expect(listener).toHaveBeenCalledTimes(2);
  });

  describe("tab sync (storage event)", () => {
    it("picks up a change made in another tab and notifies", () => {
      const storage = fakeStorage();
      const store = createCartStore(storage, window);
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      otherTabWrites(storage, JSON.stringify([{ ...item(), quantity: 2 }]));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot()[0].quantity).toBe(2);
      unsubscribe();
    });

    it("another tab clearing localStorage (key null) empties the cart", () => {
      const storage = fakeStorage();
      const store = createCartStore(storage, window);
      store.add(item());
      const unsubscribe = store.subscribe(() => {});
      storage.data.clear();
      otherTabWrites(storage, null, null);
      expect(store.getSnapshot()).toEqual([]);
      unsubscribe();
    });

    it("ignores other keys", () => {
      const storage = fakeStorage();
      const store = createCartStore(storage, window);
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      otherTabWrites(storage, "x", "something-else");
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("re-reads the storage when the first component subscribes (a change made while nobody listened)", () => {
      const storage = fakeStorage();
      const store = createCartStore(storage, window);
      expect(store.getSnapshot()).toEqual([]);
      storage.data.set(CART_STORAGE_KEY, JSON.stringify([{ ...item(), quantity: 1 }]));
      const unsubscribe = store.subscribe(() => {});
      expect(store.getSnapshot()).toHaveLength(1);
      unsubscribe();
    });

    it("no longer listens to the window once nobody is subscribed", () => {
      const storage = fakeStorage();
      const store = createCartStore(storage, window);
      store.subscribe(() => {})();
      const before = store.getSnapshot();
      otherTabWrites(storage, JSON.stringify([{ ...item(), quantity: 1 }]));
      expect(store.getSnapshot()).toBe(before);
    });
  });
});
