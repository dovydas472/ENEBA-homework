import type { Sort } from "../../api/types.ts";

/**
 * The words for each sort value (owner decision S9), shared by the desktop select and the radios in the drawer.
 * `Record<Sort, string>` makes TypeScript complain if a sort has no label.
 */
export const SORT_LABELS: Record<Sort, string> = {
  popularity: "Most popular",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  discount: "Biggest discount",
  newest: "Newest",
  title: "Name A–Z",
  relevance: "Best match", // the API's default with a search (Task 13a); not offered in the controls yet (Task 13b)
};
