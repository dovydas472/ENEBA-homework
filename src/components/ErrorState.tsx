import { Button } from "./Button.tsx";
import styles from "./ErrorState.module.css";

interface ErrorStateProps {
  title?: string;
  /** Always a GENERIC sentence. Never pass a raw server, database or exception message here. */
  message?: string;
  /** Shows the Retry button when given. */
  onRetry?: () => void;
  /** True while the retry is running: the button shows its spinner. */
  retrying?: boolean;
}

/** "Something went wrong" block with a Retry button (DESIGN.md 4.9). */
export function ErrorState({
  title = "Something went wrong",
  message = "Please try again in a moment.",
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  return (
    <div className={styles.state} role="alert">
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <Button onClick={onRetry} loading={retrying}>
          Retry
        </Button>
      )}
    </div>
  );
}
