/**
 * Which row of the suggestion list is active after ↓ or ↑. -1 = no active row (the text cursor is "in the field").
 * The list wraps: ↓ on the last row goes to the first, ↑ on the first goes to the last.
 * With nothing active, ↓ starts at the first row and ↑ at the last. An empty list has no active row.
 */
export function moveActive(current: number, count: number, direction: "down" | "up"): number {
  if (count === 0) return -1;
  if (direction === "down") return current < 0 || current >= count - 1 ? 0 : current + 1;
  return current <= 0 ? count - 1 : current - 1;
}
