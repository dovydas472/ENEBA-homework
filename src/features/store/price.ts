// Pure helpers for the price filter (no React): euros <-> cents, the slider's bounds, and the rules for
// the two thumbs. Money is integer cents everywhere; the only division by 100 is in centsToEuros (display text).
import type { PriceRange } from "../../api/types.ts";

/** One step of the slider = €0.50. */
export const SLIDER_STEP_CENTS = 50;

/** What the user typed into a price box. */
export type PriceInput = { kind: "empty" } | { kind: "ok"; cents: number } | { kind: "invalid" };

/**
 * "12" -> 1200, "12.5" -> 1250, "12,50" -> 1250, "€ 12" -> 1200. Empty text means "no limit".
 * Anything else (letters, a minus sign, more than 2 decimals, a huge number) is invalid.
 * The text is split into whole euros and cents, so no float is involved.
 */
export function parseEuros(text: string): PriceInput {
  const clean = text.replace(/[€\s]/g, "");
  if (clean === "") return { kind: "empty" };
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(clean);
  if (!match) return { kind: "invalid" };
  const euros = Number(match[1]);
  const cents = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  return { kind: "ok", cents: euros * 100 + cents };
}

/**
 * 1200 -> "12.00", 1250 -> "12.50", 1199 -> "11.99": the text that goes into a price box (no currency sign).
 * ALWAYS two decimals. While a slider thumb is dragged the number changes every step (€0.50), and if whole euros
 * lost their decimals ("49" -> "48.50" -> "48") the text would change length and width on every other frame,
 * which looks like flicker. With a fixed shape only the digits change.
 */
export function centsToEuros(cents: number): string {
  const euros = Math.floor(cents / 100);
  return `${euros}.${String(cents % 100).padStart(2, "0")}`;
}

/** The slider range: the facet range rounded OUTWARDS to a whole step, so the extreme products fit inside it. */
export function sliderBounds(range: PriceRange): { lo: number; hi: number } {
  return {
    lo: Math.floor(range.minCents / SLIDER_STEP_CENTS) * SLIDER_STEP_CENTS,
    hi: Math.ceil(range.maxCents / SLIDER_STEP_CENTS) * SLIDER_STEP_CENTS,
  };
}

/**
 * Where a thumb goes when the user drags it to `value`. The thumbs cannot cross: the minimum thumb
 * stops at the maximum thumb and the other way round. (`min`/`max` are the CURRENT positions.)
 */
export function moveThumb(which: "min" | "max", value: number, min: number, max: number): number {
  return which === "min" ? Math.min(value, max) : Math.max(value, min);
}

export type PriceDraft = { ok: true; min?: number; max?: number } | { ok: false; message: string };

/**
 * Checks the two boxes together. On success returns the limits in cents (`undefined` = no limit);
 * otherwise a message for the user and NO request is made.
 */
export function resolvePriceDraft(minText: string, maxText: string): PriceDraft {
  const min = parseEuros(minText);
  const max = parseEuros(maxText);
  if (min.kind === "invalid" || max.kind === "invalid") {
    return { ok: false, message: "Enter an amount like 12 or 12.50." };
  }
  const minCents = min.kind === "ok" ? min.cents : undefined;
  const maxCents = max.kind === "ok" ? max.cents : undefined;
  if (minCents !== undefined && maxCents !== undefined && minCents > maxCents) {
    return { ok: false, message: "The minimum price cannot be higher than the maximum." };
  }
  return { ok: true, min: minCents, max: maxCents };
}
