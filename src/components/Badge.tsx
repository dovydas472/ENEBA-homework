import type { ReactNode } from "react";
import { cx } from "../lib/cx.ts";
import styles from "./Badge.module.css";

interface BadgeProps {
  /** count = number on the cart icon, cashback = mint label on a cover, tag = outlined pill ("Cashback deal"). */
  variant?: "count" | "cashback" | "tag";
  children: ReactNode;
  className?: string;
}

/** A small label (DESIGN.md 4.5). It only draws the box; what it says is up to the caller. */
export function Badge({ variant = "tag", children, className }: BadgeProps) {
  return <span className={cx(styles.badge, styles[variant], className)}>{children}</span>;
}
