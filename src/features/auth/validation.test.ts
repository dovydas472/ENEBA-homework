import { describe, expect, it } from "vitest";
import { emailError, loginPasswordError, newPasswordError } from "./validation.ts";

describe("emailError", () => {
  it.each(["jon@example.com", "  Jon.Doe+tag@Sub.Example.lt  "])("accepts %j", (email) => {
    expect(emailError(email)).toBeUndefined();
  });

  it("asks for an email when empty", () => {
    expect(emailError("   ")).toBe("Enter your email");
  });

  it.each(["jon", "jon@", "jon@localhost", "jon doe@example.com", "@example.com", `${"a".repeat(250)}@x.lt`])(
    "rejects %j",
    (email) => {
      expect(emailError(email)).toBe("Enter a valid email address");
    },
  );
});

describe("newPasswordError", () => {
  it("needs 8 to 128 characters, counting characters (not bytes) and keeping spaces", () => {
    expect(newPasswordError("1234567")).toBe("Password must be at least 8 characters");
    expect(newPasswordError("12345678")).toBeUndefined();
    expect(newPasswordError("ąčęėįšųū")).toBeUndefined(); // 8 characters
    expect(newPasswordError("        ")).toBeUndefined();
    expect(newPasswordError("x".repeat(128))).toBeUndefined();
    expect(newPasswordError("x".repeat(129))).toBe("Password must be at most 128 characters");
    expect(newPasswordError("😀".repeat(128))).toBeUndefined(); // 256 UTF-16 units, 128 characters
  });
});

describe("loginPasswordError", () => {
  it("only asks for a password; a short one is left to the server's generic answer", () => {
    expect(loginPasswordError("")).toBe("Enter your password");
    expect(loginPasswordError("short")).toBeUndefined();
  });
});
