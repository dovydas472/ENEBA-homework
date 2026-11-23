import type { ComponentType } from "react";
import { cx } from "../../lib/cx.ts";
import { BlockBoundary } from "./BlockBoundary.tsx";
import styles from "./BlockRenderer.module.css";
import type { BlockProps } from "./blockTypes.ts";
import { HeroCarousel } from "./HeroCarousel.tsx";
import { PlatformRow } from "./PlatformRow.tsx";
import { ProductRow } from "./ProductRow.tsx";
import { SideTiles } from "./SideTiles.tsx";

/**
 * ONE renderer per block TYPE. This map is everything the frontend knows about the home page: which blocks
 * exist, their order, titles and content all come from the server (GET /api/homepage + each block's endpoint).
 * A new kind of block = a new entry here (and an endpoint on the server).
 */
const RENDERERS: Record<string, ComponentType<BlockProps>> = {
  hero: HeroCarousel,
  tiles: SideTiles,
  platforms: PlatformRow,
  product_row: ProductRow,
};

/** CSS class of the slot a block type sits in (the hero and the tiles share a row on desktop). */
const SLOT_CLASS: Record<string, string | undefined> = {
  hero: styles.hero,
  tiles: styles.tiles,
};

/**
 * Draws one block of the registry. A type this build does not know (a newer server, an old open tab) is
 * skipped, not an error. Each block is wrapped in its own error boundary: a block that crashes hides itself.
 */
export function BlockRenderer({ block }: BlockProps) {
  // Object.hasOwn: a type like "toString" must not find Object.prototype.toString.
  const Renderer = Object.hasOwn(RENDERERS, block.type) ? RENDERERS[block.type] : undefined;
  if (!Renderer) return null;
  return (
    <div className={cx(styles.slot, SLOT_CLASS[block.type])} data-block-type={block.type}>
      <BlockBoundary blockKey={block.key}>
        <Renderer block={block} />
      </BlockBoundary>
    </div>
  );
}
