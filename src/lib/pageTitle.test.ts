import { describe, expect, it } from "vitest";
import { pageTitle } from "./pageTitle.ts";

describe("pageTitle", () => {
  it("uses the long title for the home page (no page name)", () => {
    expect(pageTitle()).toBe("EneHomeworkBa – internship demo");
  });

  it("puts the page name before the app name", () => {
    expect(pageTitle("Store")).toBe("Store – EneHomeworkBa");
  });
});
