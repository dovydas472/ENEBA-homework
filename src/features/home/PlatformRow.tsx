import { useQuery } from "@tanstack/react-query";
import { Gamepad, Gamepad2, Joystick, LayoutGrid, Monitor, TabletSmartphone, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { homeBlockQuery } from "../../api/queries.ts";
import type { PlatformsBlockData } from "../../api/types.ts";
import { Skeleton } from "../../components/Skeleton.tsx";
import type { BlockProps } from "./blockTypes.ts";
import { BlockError } from "./BlockError.tsx";
import styles from "./PlatformRow.module.css";

/**
 * The icon NAMES the server may send (homepage_blocks.config of the platforms block) and the generic lucide icon
 * each one draws. No brand logos (CLAUDE.md). An unknown name gets the default.
 */
const ICONS: Record<string, LucideIcon> = {
  monitor: Monitor,
  gamepad: Gamepad,
  "gamepad-2": Gamepad2,
  joystick: Joystick,
  "layout-grid": LayoutGrid,
  "tablet-smartphone": TabletSmartphone,
};
const DEFAULT_ICON = Gamepad2;

/** Placeholders while loading: about one row's worth on a desktop screen. */
const SKELETON_ITEMS = 8;

const productCount = (n: number) => `${n} ${n === 1 ? "product" : "products"}`;

/**
 * Platform row block (H3): "All games" + one link per platform with its number of products, like Eneba's
 * category row. It scrolls sideways when it does not fit (phones).
 */
export function PlatformRow({ block }: BlockProps) {
  const query = useQuery(homeBlockQuery<PlatformsBlockData>(block.endpoint));

  return (
    <nav className={styles.nav} aria-label={block.title}>
      {query.isPending && (
        <ul className={styles.row} aria-hidden="true">
          {Array.from({ length: SKELETON_ITEMS }, (_, i) => (
            // The same boxes as a real entry (icon, label line, count line), so nothing moves when it arrives.
            <li key={i} className={styles.item}>
              <Skeleton variant="block" className={styles.icon} />
              <span className={styles.label}>
                <Skeleton variant="block" className={styles.skeletonLine} />
              </span>
              <span className={styles.count}>
                <Skeleton variant="block" className={styles.skeletonLine} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {query.isError && <BlockError title={block.title} onRetry={() => void query.refetch()} retrying={query.isFetching} />}
      {query.data && (
        <ul className={styles.row}>
          {query.data.items.map((item) => {
            const Icon = (Object.hasOwn(ICONS, item.icon) ? ICONS[item.icon] : undefined) ?? DEFAULT_ICON;
            return (
              <li key={item.key}>
                <Link to={item.href} className={styles.item}>
                  <Icon className={styles.icon} aria-hidden="true" />
                  <span className={styles.label}>{item.label}</span>
                  <span className={styles.count}>{productCount(item.count)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
