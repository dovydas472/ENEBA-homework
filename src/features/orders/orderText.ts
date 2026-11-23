// Small text helpers of the order pages.
import type { OrderStatus } from "../../api/types.ts";

/** The status badge text. Words, not only colours: the badge must be readable without seeing the colour. */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "Paid",
  pending: "Pending payment",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** A status the app does not know yet (a newer server) is shown as the server wrote it, never crashes. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status as OrderStatus] ?? status;
}

/**
 * "DEMO-AB12-CD34-EF56" → "DEMO-••••-••••-••••": the first group stays (it says what kind of key it is), every
 * other character is replaced, the dashes stay so the length and shape are visible. A key without dashes is hidden completely.
 * Masking is only about the SCREEN (someone looking over the shoulder, a screen share); the key is the user's own.
 */
export function maskKey(key: string): string {
  const parts = key.split("-");
  if (parts.length === 1) return "•".repeat(key.length);
  return [parts[0], ...parts.slice(1).map((part) => "•".repeat(part.length))].join("-");
}

/** "1 item" / "3 items" */
export function itemCountText(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}
