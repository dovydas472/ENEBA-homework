// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./isTypingTarget.ts";

describe("isTypingTarget", () => {
  it("is true for text fields, textareas and selects", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
  });

  it("is true for an editable element", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true"); // jsdom does not implement the contentEditable property
    expect(isTypingTarget(div)).toBe(true);
  });

  it("is false for buttons, links and the page itself", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(document.createElement("a"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
