import { describe, expect, it } from "vitest";
import { centsToEuros, moveThumb, parseEuros, resolvePriceDraft, sliderBounds } from "./price.ts";

describe("parseEuros (euros typed by the user -> integer cents)", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["12,50", 1250], // a comma is a decimal separator for many users
    ["0.99", 99],
    ["0", 0],
    ["€ 12", 1200],
    [" 7.05 ", 705],
  ])("%j is %i cents", (text, cents) => {
    expect(parseEuros(text)).toEqual({ kind: "ok", cents });
  });

  it("treats empty text as 'no limit'", () => {
    expect(parseEuros("")).toEqual({ kind: "empty" });
    expect(parseEuros("   ")).toEqual({ kind: "empty" });
  });

  it.each(["abc", "-5", "12.345", "1e3", "12.", ".5", "1.2.3", "12 EUR", "99999999999"])("%j is invalid", (text) => {
    expect(parseEuros(text)).toEqual({ kind: "invalid" });
  });

  it("does not use floats (19.99 would be 1998.9999... with * 100)", () => {
    expect(parseEuros("19.99")).toEqual({ kind: "ok", cents: 1999 });
    expect(parseEuros("1.15")).toEqual({ kind: "ok", cents: 115 });
  });
});

describe("centsToEuros", () => {
  it("shows whole euros without decimals and others with two", () => {
    expect(centsToEuros(1200)).toBe("12");
    expect(centsToEuros(1250)).toBe("12.50");
    expect(centsToEuros(1199)).toBe("11.99");
    expect(centsToEuros(705)).toBe("7.05");
    expect(centsToEuros(0)).toBe("0");
  });

  it("is the inverse of parseEuros", () => {
    for (const cents of [0, 5, 99, 100, 549, 1099, 5099, 123456]) {
      expect(parseEuros(centsToEuros(cents))).toEqual({ kind: "ok", cents });
    }
  });
});

describe("sliderBounds", () => {
  it("rounds the facet range outwards to a €0.50 step", () => {
    expect(sliderBounds({ minCents: 549, maxCents: 5099 })).toEqual({ lo: 500, hi: 5100 });
  });

  it("keeps a range that already sits on the step", () => {
    expect(sliderBounds({ minCents: 500, maxCents: 2000 })).toEqual({ lo: 500, hi: 2000 });
  });
});

describe("moveThumb (the thumbs cannot cross)", () => {
  it("moves a thumb freely while it stays on its own side", () => {
    expect(moveThumb("min", 800, 500, 2000)).toBe(800);
    expect(moveThumb("max", 1500, 500, 2000)).toBe(1500);
  });

  it("stops the minimum thumb at the maximum thumb", () => {
    expect(moveThumb("min", 2500, 500, 2000)).toBe(2000);
  });

  it("stops the maximum thumb at the minimum thumb", () => {
    expect(moveThumb("max", 100, 500, 2000)).toBe(500);
  });
});

describe("resolvePriceDraft", () => {
  it("returns the limits in cents, undefined for an empty box", () => {
    expect(resolvePriceDraft("5", "20.5")).toEqual({ ok: true, min: 500, max: 2050 });
    expect(resolvePriceDraft("", "20")).toEqual({ ok: true, min: undefined, max: 2000 });
    expect(resolvePriceDraft("", "")).toEqual({ ok: true, min: undefined, max: undefined });
  });

  it("accepts min equal to max", () => {
    expect(resolvePriceDraft("10", "10")).toEqual({ ok: true, min: 1000, max: 1000 });
  });

  it("rejects text that is not an amount", () => {
    const result = resolvePriceDraft("abc", "20");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("Enter an amount");
  });

  it("rejects min > max with a message", () => {
    const result = resolvePriceDraft("30", "10");
    expect(result).toEqual({ ok: false, message: "The minimum price cannot be higher than the maximum." });
  });
});
