import { describe, expect, it } from "vitest";
import { authPageLink, safeNextPath } from "./safeNext.ts";

describe("safeNextPath", () => {
  it.each([
    ["/orders", "/orders"],
    ["/store?platform=steam&q=gta", "/store?platform=steam&q=gta"],
    ["/product/the-witcher-3#offers", "/product/the-witcher-3#offers"],
    ["/", "/"],
  ])("keeps the same-site path %s", (raw, want) => {
    expect(safeNextPath(raw)).toBe(want);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["orders"], // relative, no leading slash
    ["https://evil.example"], // scheme
    ["http://evil.example/orders"],
    ["javascript:alert(1)"],
    ["data:text/html,hi"],
    ["//evil.example"], // protocol-relative = another host
    ["//evil.example/orders"],
    ["/\\evil.example"], // browsers read "\" as "/" -> "//evil.example"
    ["/\\/evil.example"],
    [decodeURIComponent("/%0d%0aLocation:evil")], // CR LF
    ["/\torders"],
    ["/login"], // would loop back to the sign-in page
    ["/register?next=/orders"],
  ])("rejects %j and goes to /", (raw) => {
    expect(safeNextPath(raw as string | null | undefined)).toBe("/");
  });
});

describe("authPageLink", () => {
  it("adds an encoded next for a real target", () => {
    expect(authPageLink("/login", "/store?q=gta 5")).toBe("/login?next=%2Fstore%3Fq%3Dgta%25205");
  });

  it("leaves next out for / and for unsafe targets", () => {
    expect(authPageLink("/register", "/")).toBe("/register");
    expect(authPageLink("/login", "//evil.example")).toBe("/login");
  });
});
