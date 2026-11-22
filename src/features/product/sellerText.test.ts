import { describe, expect, it } from "vitest";
import type { Seller } from "../../api/types.ts";
import { ratingText, reviewsText } from "./sellerText.ts";

describe("seller texts", () => {
  const seller = (overrides: Partial<Seller>): Seller => ({
    slug: "s",
    name: "S",
    rating: 9.63,
    ratingLabel: "Excellent",
    isNew: false,
    reviewsCount: 9875,
    ...overrides,
  });

  it("label + score with two decimals", () => {
    expect(ratingText(seller({}))).toBe("Excellent 9.63");
    expect(ratingText(seller({ rating: 9.9, ratingLabel: "Superb" }))).toBe("Superb 9.90");
  });

  it("only the score when there is no label, 'New seller' without a rating", () => {
    expect(ratingText(seller({ rating: 7.38, ratingLabel: null }))).toBe("7.38");
    expect(ratingText(seller({ rating: null, ratingLabel: null, isNew: true, reviewsCount: 0 }))).toBe("New seller");
  });

  it("reviews count with a thousands separator and the right plural", () => {
    expect(reviewsText(9875)).toBe("9,875 reviews");
    expect(reviewsText(1)).toBe("1 review");
    expect(reviewsText(0)).toBe("0 reviews");
  });
});
