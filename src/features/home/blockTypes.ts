import type { HomeBlock } from "../../api/types.ts";

/** What every block renderer gets: its registry entry (type, title, endpoint). It fetches its own content. */
export interface BlockProps {
  block: HomeBlock;
}
