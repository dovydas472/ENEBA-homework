import type { ReactNode } from "react";
import { cx } from "../lib/cx.ts";
import styles from "./Badge.module.css";

interface BadgeProps {
  /** count = number on the cart icon, cashback = mint label on a cover, tag = outlined pill ("Cashback deal"),
   *  text = plain mint uppercase text without a box (platform / region on a product card). */
  variant?: "count" | "cashback" | "tag" | "text";
  children: ReactNode;
  className?: string;
}

/** A small label (DESIGN.md 4.5). It only draws the box; what it says is up to the caller. */
export function Badge({ variant = "tag", children, className }: BadgeProps) {
  return <span className={cx(styles.badge, styles[variant], className)}>{children}</span>;
}
