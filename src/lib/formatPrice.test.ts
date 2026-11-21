import { describe, expect, it } from "vitest";
import { formatPrice } from "./formatPrice.ts";

describe("formatPrice", () => {
  it("formats zero", () => {
    expect(formatPrice(0)).toBe("€0.00");
  });

  it("pads cents to two digits", () => {
    expect(formatPrice(5)).toBe("€0.05");
  });

  it("formats a normal price", () => {
    expect(formatPrice(1199)).toBe("€11.99");
  });

  it("uses a thousands separator for big amounts", () => {
    expect(formatPrice(100000)).toBe("€1,000.00");
  });

  it("shows a dash when the price is unknown (null or undefined)", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(undefined)).toBe("—");
  });
});
