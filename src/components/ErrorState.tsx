import type { ReactNode } from "react";
import { Button } from "./Button.tsx";
import styles from "./ErrorState.module.css";

interface ErrorStateProps {
  title?: string;
  /** Heading level of the title: h2 inside a page (default), h1 when this block IS the whole page (the error page). */
  as?: "h1" | "h2";
  /** Always a GENERIC sentence. Never pass a raw server, database or exception message here. */
  message?: string;
  /** Shows the Retry button when given. */
  onRetry?: () => void;
  /** True while the retry is running: the button shows its spinner. */
  retrying?: boolean;
  /** More actions next to Retry (the error page adds "Home"). */
  children?: ReactNode;
}

/** "Something went wrong" block with a Retry button (DESIGN.md 4.9). */
export function ErrorState({
  title = "Something went wrong",
  as: Heading = "h2",
  message = "Please try again in a moment.",
  onRetry,
  retrying = false,
  children,
}: ErrorStateProps) {
  return (
    <div className={styles.state} role="alert">
      <Heading className={styles.title}>{title}</Heading>
      <p className={styles.message}>{message}</p>
      {(onRetry || children) && (
        <div className={styles.actions}>
          {onRetry && (
            <Button onClick={onRetry} loading={retrying}>
              Retry
            </Button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
