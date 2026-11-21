/** One entry of the pagination: a page number, or "…" for a skipped stretch of pages. */
export type PageItem = number | "…";

/**
 * Which buttons the pagination shows. At most 7 entries, so the bar never changes width while paging:
 *   5 pages, any current   -> 1 2 3 4 5
 *   10 pages, current 2    -> 1 2 3 4 5 … 10
 *   10 pages, current 5    -> 1 … 4 5 6 … 10
 *   10 pages, current 9    -> 1 … 6 7 8 9 10
 */
export function pageList(current: number, total: number): PageItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}
