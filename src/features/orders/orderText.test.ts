import { describe, expect, it } from "vitest";
import { formatDateTime } from "../../lib/formatDate.ts";
import { itemCountText, maskKey, statusLabel } from "./orderText.ts";

describe("maskKey", () => {
  it("keeps the first group and the dashes, hides everything else", () => {
    expect(maskKey("DEMO-AB12-CD34-EF56")).toBe("DEMO-••••-••••-••••");
    expect(maskKey("ABCDEF")).toBe("••••••");
  });
});

describe("statusLabel / itemCountText", () => {
  it("names every status in words; unknown statuses are shown as sent", () => {
    expect(["paid", "pending", "expired", "cancelled"].map(statusLabel)).toEqual([
      "Paid",
      "Pending payment",
      "Expired",
      "Cancelled",
    ]);
    expect(statusLabel("refunded")).toBe("refunded");
  });

  it("1 item / 3 items", () => {
    expect(itemCountText(1)).toBe("1 item");
    expect(itemCountText(3)).toBe("3 items");
  });
});

describe("formatDateTime", () => {
  it("prints the moment in the given time zone; bad input is shown as sent", () => {
    expect(formatDateTime("2026-11-22T14:05:00Z", "UTC")).toBe("22 Nov 2026, 14:05");
    expect(formatDateTime("2026-11-22T14:05:00Z", "Europe/Vilnius")).toBe("22 Nov 2026, 16:05");
    expect(formatDateTime("not a date")).toBe("not a date");
  });
});
