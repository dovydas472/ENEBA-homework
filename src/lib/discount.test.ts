// discountPercent: the "-NN%" of one offer.
import { describe, expect, it } from "vitest";
import { discountPercent } from "./discount.ts";

describe("discountPercent", () => {
  it("whole percent, rounded down (same rule as the server)", () => {
    expect(discountPercent(1099, 3999)).toBe(72); // 72.51 -> 72
    expect(discountPercent(1199, 2999)).toBe(60); // 60.02 -> 60
    expect(discountPercent(2999, 3000)).toBe(0); // 0.03 -> 0 (Price shows no badge for 0)
  });

  it("null when there is nothing to compare or no real discount", () => {
    expect(discountPercent(1099, null)).toBeNull();
    expect(discountPercent(null, 3999)).toBeNull();
    expect(discountPercent(3999, 3999)).toBeNull();
    expect(discountPercent(4999, 3999)).toBeNull();
    expect(discountPercent(100, 0)).toBeNull();
  });
});
