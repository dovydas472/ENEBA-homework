import { describe, expect, it } from "vitest";
import { pageList } from "./pageList.ts";

describe("pageList", () => {
  it("shows every page when there are 7 or fewer", () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("near the start: first pages, an ellipsis, the last page", () => {
    expect(pageList(1, 10)).toEqual([1, 2, 3, 4, 5, "…", 10]);
    expect(pageList(4, 10)).toEqual([1, 2, 3, 4, 5, "…", 10]);
  });

  it("in the middle: both ends, the current page and its neighbours", () => {
    expect(pageList(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
    expect(pageList(6, 10)).toEqual([1, "…", 5, 6, 7, "…", 10]);
  });

  it("near the end: the first page, an ellipsis, the last pages", () => {
    expect(pageList(7, 10)).toEqual([1, "…", 6, 7, 8, 9, 10]);
    expect(pageList(10, 10)).toEqual([1, "…", 6, 7, 8, 9, 10]);
  });

  it("always has the same number of entries for 8+ pages (the bar does not jump)", () => {
    for (let current = 1; current <= 20; current++) expect(pageList(current, 20)).toHaveLength(7);
  });

  it("contains the current page", () => {
    for (let current = 1; current <= 20; current++) expect(pageList(current, 20)).toContain(current);
  });
});
