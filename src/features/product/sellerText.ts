import type { Seller } from "../../api/types.ts";

const count = new Intl.NumberFormat("en-IE");

/**
 * The rating as one short text (owner decision P2): "Excellent 9.63", just "7.38" when the score has no label,
 * or "New seller" when the seller has no rating yet. The number always has two decimals, like Eneba ("9.90").
 */
export function ratingText(seller: Seller): string {
  if (seller.isNew || seller.rating === null) return "New seller";
  const score = seller.rating.toFixed(2); // display only; the rating is not money
  return seller.ratingLabel ? `${seller.ratingLabel} ${score}` : score;
}

/** "9,875 reviews" / "1 review". */
export function reviewsText(reviewsCount: number): string {
  return `${count.format(reviewsCount)} ${reviewsCount === 1 ? "review" : "reviews"}`;
}
