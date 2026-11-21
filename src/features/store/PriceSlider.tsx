import type { CSSProperties } from "react";
import { cx } from "../../lib/cx.ts";
import { formatPrice } from "../../lib/formatPrice.ts";
import { SLIDER_STEP_CENTS } from "./price.ts";
import styles from "./PriceSlider.module.css";

interface PriceSliderProps {
  /** The ends of the slider, in cents. */
  lo: number;
  hi: number;
  /** Where the two thumbs are now, in cents. */
  min: number;
  max: number;
  disabled?: boolean;
  /** Called on EVERY move while dragging (the boxes follow live). The parent applies the "cannot cross" rule. */
  onMove: (which: "min" | "max", cents: number) => void;
  /** Called once when the user lets go (pointer up / key up): this is the moment to change the URL. */
  onRelease: () => void;
}

/**
 * A two-thumb range slider made of two native <input type="range"> laid over one track (no library).
 * Native inputs give keyboard (arrows, Home/End, PageUp/PageDown) and screen-reader support for free;
 * each thumb has its own label and a spoken value in euros (aria-valuetext).
 * CSS makes both inputs click-through except their thumbs, so each thumb can be grabbed separately.
 */
export function PriceSlider({ lo, hi, min, max, disabled = false, onMove, onRelease }: PriceSliderProps) {
  const percent = (cents: number) => (hi > lo ? ((cents - lo) / (hi - lo)) * 100 : 0);

  // When both thumbs sit on the same spot, the one on top is the one you can still drag AWAY from the
  // other: in the upper half that is the minimum thumb (it can go left), in the lower half the maximum thumb.
  const minOnTop = min >= (lo + hi) / 2;

  // The highlighted part of the track is placed with two CSS variables. A style attribute is needed here
  // because the numbers change while dragging (a class cannot hold them); it carries positions, not colours or sizes.
  const geometry = { "--slider-start": `${percent(min)}%`, "--slider-end": `${percent(max)}%` } as CSSProperties;

  // Keys that change a thumb. keyup (not keydown) = once per key press, after the move; Tab is not in the list.
  const isMovementKey = (key: string) =>
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(key);

  function thumb(which: "min" | "max", value: number) {
    return (
      <input
        type="range"
        className={cx(styles.thumb, which === "min" ? minOnTop && styles.onTop : !minOnTop && styles.onTop)}
        min={lo}
        max={hi}
        step={SLIDER_STEP_CENTS}
        value={value}
        disabled={disabled}
        aria-label={which === "min" ? "Minimum price" : "Maximum price"}
        aria-valuetext={formatPrice(value)}
        // React's onChange on a range input fires on every `input` event, i.e. continuously while dragging.
        onChange={(event) => onMove(which, Number(event.target.value))}
        onPointerUp={onRelease}
        onKeyUp={(event) => isMovementKey(event.key) && onRelease()}
      />
    );
  }

  return (
    <div className={cx(styles.slider, disabled && styles.disabled)} style={geometry}>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.range} />
      </div>
      {thumb("min", min)}
      {thumb("max", max)}
    </div>
  );
}
