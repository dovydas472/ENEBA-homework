import { describe, expect, it } from "vitest";
import { moveActive } from "./moveActive.ts";

describe("moveActive", () => {
  it("↓ with nothing active starts at the first row, ↑ at the last", () => {
    expect(moveActive(-1, 4, "down")).toBe(0);
    expect(moveActive(-1, 4, "up")).toBe(3);
  });

  it("moves one row", () => {
    expect(moveActive(1, 4, "down")).toBe(2);
    expect(moveActive(2, 4, "up")).toBe(1);
  });

  it("wraps around at both ends", () => {
    expect(moveActive(3, 4, "down")).toBe(0);
    expect(moveActive(0, 4, "up")).toBe(3);
  });

  it("an empty list has no active row", () => {
    expect(moveActive(-1, 0, "down")).toBe(-1);
    expect(moveActive(2, 0, "up")).toBe(-1);
  });

  it("an index past a (shorter) new list starts again from the first row", () => {
    expect(moveActive(5, 3, "down")).toBe(0);
  });
});
