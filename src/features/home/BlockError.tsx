import { Button } from "../../components/Button.tsx";
import styles from "./BlockError.module.css";

interface BlockErrorProps {
  /** The block's title, so the message says WHICH part of the page failed. */
  title: string;
  onRetry: () => void;
  retrying: boolean;
}

/**
 * The small error of ONE home page block: a line of text and Retry. The rest of the page keeps working
 * (each block has its own request). role="alert" announces it to screen readers.
 */
export function BlockError({ title, onRetry, retrying }: BlockErrorProps) {
  return (
    <div className={styles.error} role="alert">
      <p className={styles.text}>“{title}” could not be loaded.</p>
      <Button variant="secondary" onClick={onRetry} loading={retrying}>
        Retry
      </Button>
    </div>
  );
}
