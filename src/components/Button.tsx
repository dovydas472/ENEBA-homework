import type { ComponentProps, MouseEvent } from "react";
import { Link } from "react-router";
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

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: "primary" | "secondary";
}

/**
 * A router link that LOOKS like a Button (e.g. "Browse the store" on the home page).
 * Going to another page is navigation, so the right element is a link (<a>), not a <button>:
 * it can be opened in a new tab, and screen readers announce it as a link.
 */
export function ButtonLink({ variant = "primary", className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link {...rest} className={cx(styles.button, styles[variant], className)}>
      <span className={styles.label}>{children}</span>
    </Link>
  );
}
