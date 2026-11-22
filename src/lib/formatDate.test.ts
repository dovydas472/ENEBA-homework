import { describe, expect, it } from "vitest";
import { formatReleaseDate } from "./formatDate.ts";

describe("formatReleaseDate", () => {
  it("prints the calendar date in English, never shifted by the time zone", () => {
    expect(formatReleaseDate("2015-05-19")).toBe("19 May 2015");
    expect(formatReleaseDate("2024-01-01")).toBe("1 January 2024");
  });

  it("shows unexpected text unchanged", () => {
    expect(formatReleaseDate("soon")).toBe("soon");
  });
});
