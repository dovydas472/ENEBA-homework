import type { ComponentProps, MouseEvent } from "react";
import { cx } from "../lib/cx.ts";
import styles from "./Button.module.css";

export interface ButtonProps extends ComponentProps<"button"> {
  /** primary = the main action (once per view area), secondary = outlined, ghost = text-like. */
  variant?: "primary" | "secondary" | "ghost";
  /** Shows a spinner instead of the label, keeps the size and ignores clicks. */
  loading?: boolean;
}

/**
 * The one button of the app (DESIGN.md 4.1). `disabled` is the normal HTML attribute.
 * While `loading` the button is NOT disabled (it would lose keyboard focus); it is marked
 * aria-busy and its clicks are swallowed instead.
 */
export function Button({
  variant = "primary",
  loading = false,
  type = "button", // a <button> inside a <form> submits by default; make that opt-in
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault(); // also stops a submit button from submitting
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      {...rest}
      type={type}
      className={cx(styles.button, styles[variant], loading && styles.loading, className)}
      aria-busy={loading || undefined}
      onClick={handleClick}
    >
      <span className={styles.label}>{children}</span>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
    </button>
  );
}
