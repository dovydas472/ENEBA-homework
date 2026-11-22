import { cx } from "../lib/cx.ts";
import styles from "./Skeleton.module.css";

interface SkeletonProps {
  /** text = one line of text (full width, one line tall); block = fills its box, the caller sets the size. */
  variant?: "text" | "block";
  /** Use it to set the size of a block, e.g. a portrait cover box. */
  className?: string;
}

/** A grey placeholder with a moving highlight, shown while data loads (DESIGN.md 4.10). Hidden from screen readers. */
export function Skeleton({ variant = "text", className }: SkeletonProps) {
  return <span className={cx(styles.skeleton, styles[variant], className)} aria-hidden="true" />;
}
