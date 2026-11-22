import { SORTS, type Sort } from "../../api/types.ts";

/**
 * The words for each sort value (owner decision S9), shared by the desktop select and the radios in the drawer.
 * `Record<Sort, string>` makes TypeScript complain if a sort has no label.
 */
export const SORT_LABELS: Record<Sort, string> = {
  relevance: "Best match",
  popularity: "Most popular",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  discount: "Biggest discount",
  newest: "Newest",
  title: "Name A–Z",
  relevance: "Best match", // the API's default with a search (Task 13a); not offered in the controls yet (Task 13b)
};

/**
 * Which sorts the Store offers. "Best match" ranks by how well a product matches the search text, so it is offered
 * (and is the default) only while there is one; without `q` the list starts with "Most popular", as before.
 */
export function sortOptions(hasQuery: boolean): readonly Sort[] {
  return hasQuery ? SORTS : SORTS.filter((sort) => sort !== "relevance");
}

/** The sort used when the URL has none: "Best match" with a search text, otherwise "Most popular". */
export function defaultSort(hasQuery: boolean): Sort {
  return hasQuery ? "relevance" : "popularity";
}
