import { Minus, Plus } from "lucide-react";
import styles from "./QuantityStepper.module.css";

interface QuantityStepperProps {
  value: number;
  /** Largest allowed value: min(stock, 5) (cart rule C2). The smallest is always 1 - "Remove" takes a line out. */
  max: number;
  onChange: (value: number) => void;
  /** Names the group for screen readers: "Quantity of The Witcher 3". */
  label: string;
}

/**
 * "− 1 +" as on Eneba's cart. Real buttons (keyboard and screen readers work); a button is disabled at its limit,
 * so the user sees why it does nothing. The number is announced politely when it changes.
 */
export function QuantityStepper({ value, max, onChange, label }: QuantityStepperProps) {
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <button
        type="button"
        className={styles.button}
        aria-label="Decrease quantity"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus className={styles.icon} aria-hidden="true" />
      </button>
      <span className={styles.value} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={styles.button}
        aria-label="Increase quantity"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className={styles.icon} aria-hidden="true" />
      </button>
    </div>
  );
}
