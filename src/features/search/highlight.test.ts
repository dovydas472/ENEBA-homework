import { describe, expect, it } from "vitest";
import { highlightParts } from "./highlight.ts";

describe("highlightParts", () => {
  it("marks the typed part, keeping the title's own spelling", () => {
    expect(highlightParts("The Witcher 3", "witch")).toEqual([
      { text: "The ", match: false },
      { text: "Witch", match: true },
      { text: "er 3", match: false },
    ]);
  });

  it("ignores upper / lower case in both directions", () => {
    expect(highlightParts("portal 2", "PORTAL")).toEqual([
      { text: "portal", match: true },
      { text: " 2", match: false },
    ]);
  });

  it("marks only the first place it appears", () => {
    expect(highlightParts("Dark Souls Dark", "dark")).toEqual([
      { text: "Dark", match: true },
      { text: " Souls Dark", match: false },
    ]);
  });

  it("marks a match at the end (no empty plain part)", () => {
    expect(highlightParts("Elden Ring", "ring")).toEqual([
      { text: "Elden ", match: false },
      { text: "Ring", match: true },
    ]);
  });

  it("ignores spaces around the typed text", () => {
    expect(highlightParts("Hades", "  hades ")).toEqual([{ text: "Hades", match: true }]);
  });

  it("no plain substring (a typo or an alias hit) -> the whole text, not marked", () => {
    expect(highlightParts("The Witcher 3", "witchr")).toEqual([{ text: "The Witcher 3", match: false }]);
    expect(highlightParts("Grand Theft Auto V", "gta")).toEqual([{ text: "Grand Theft Auto V", match: false }]);
  });

  it("an empty text marks nothing", () => {
    expect(highlightParts("Hades", "")).toEqual([{ text: "Hades", match: false }]);
    expect(highlightParts("Hades", "   ")).toEqual([{ text: "Hades", match: false }]);
  });

  it("skips titles whose length changes when lower-cased (the positions would not line up)", () => {
    expect(highlightParts("İstanbul", "stan")).toEqual([{ text: "İstanbul", match: false }]);
  });
});
