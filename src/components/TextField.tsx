import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "../lib/cx.ts";
import styles from "./TextField.module.css";

export interface TextFieldProps extends Omit<ComponentProps<"input">, "id"> {
  /** The visible label (always shown: a placeholder is not a label). */
  label: string;
  /** Error text under the field. While set, the field is marked aria-invalid and the text is linked to it. */
  error?: string;
  /** Help text under the field (e.g. "8–128 characters"). */
  hint?: string;
  /** Something inside the field on the right, e.g. the show/hide password button. */
  trailing?: ReactNode;
}

/**
 * A labelled text input (DESIGN.md 4.2) with an optional hint and error.
 * The <label> is tied to the input (htmlFor), and the hint and error are tied with aria-describedby, so a screen
 * reader reads "Email, edit text, Enter a valid email address" when the field gets focus.
 */
export function TextField({ label, error, hint, trailing, className, ...input }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={cx(styles.control, error && styles.invalid)}>
        <input
          {...input}
          id={id}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {trailing}
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
