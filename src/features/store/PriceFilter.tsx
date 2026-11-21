import { useId, useState } from "react";
import type { PriceRange } from "../../api/types.ts";
import { moveThumb, centsToEuros, parseEuros, resolvePriceDraft, sliderBounds } from "./price.ts";
import { PriceSlider } from "./PriceSlider.tsx";
import styles from "./PriceFilter.module.css";

interface PriceFilterProps {
  /** Cheapest and dearest in-stock price for the current platform/region filters; null = nothing in stock. */
  range: PriceRange | null;
  /** The limits that are applied now (from the URL), in cents; undefined = no limit. */
  minCents?: number;
  maxCents?: number;
  /** Called with the new limits (cents) when the user commits a change; no request is made for invalid input. */
  onApply: (minCents: number | undefined, maxCents: number | undefined) => void;
}

/** Text for a price box. */
const toText = (cents: number | undefined) => (cents === undefined ? "" : centsToEuros(cents));

/**
 * The price filter: a two-thumb slider and two boxes in euros that always show the same numbers.
 *
 * What is typed or dragged is a DRAFT (the two texts below). The URL - and so the request - changes only when
 * the user commits: on Enter or on leaving a box, and when a thumb is released. While dragging, the boxes
 * update live but nothing is requested.
 */
export function PriceFilter({ range, minCents, maxCents, onApply }: PriceFilterProps) {
  const errorId = useId();
  const [minText, setMinText] = useState(toText(minCents));
  const [maxText, setMaxText] = useState(toText(maxCents));
  const [error, setError] = useState<string | null>(null);

  // The URL is the source of truth: when the applied limits change from outside (Clear all, a chip, Back),
  // the draft is reset to them. Comparing during render is React's way to "adjust state when a prop changes".
  const [seen, setSeen] = useState({ minCents, maxCents });
  if (seen.minCents !== minCents || seen.maxCents !== maxCents) {
    setSeen({ minCents, maxCents });
    setMinText(toText(minCents));
    setMaxText(toText(maxCents));
    setError(null);
  }

  // Slider geometry. Without a range (nothing in stock) the slider is disabled and sits at 0.
  const { lo, hi } = range ? sliderBounds(range) : { lo: 0, hi: 0 };
  const typedMin = parseEuros(minText);
  const typedMax = parseEuros(maxText);
  // A thumb sits on its typed value (kept inside the slider), or on its end when the box is empty / invalid.
  const clamp = (cents: number) => Math.min(Math.max(cents, lo), hi);
  const thumbMax = typedMax.kind === "ok" ? clamp(typedMax.cents) : hi;
  const thumbMin = Math.min(typedMin.kind === "ok" ? clamp(typedMin.cents) : lo, thumbMax);

  /**
   * Validates both boxes; if they are fine and different from what is applied, asks the parent to apply them.
   * `fromSlider`: a thumb was released. A thumb at the very end of the slider then means "no limit".
   */
  function commit(fromSlider = false) {
    const draft = resolvePriceDraft(minText, maxText);
    if (!draft.ok) {
      setError(draft.message); // shown under the boxes, no request
      return;
    }
    setError(null);
    const min = fromSlider && draft.min !== undefined && draft.min <= lo ? undefined : draft.min;
    const max = fromSlider && draft.max !== undefined && draft.max >= hi ? undefined : draft.max;
    if (min !== minCents || max !== maxCents) {
      onApply(min, max);
    } else {
      // Nothing to apply (e.g. a thumb was dragged away and back): show the applied limits again.
      setMinText(toText(minCents));
      setMaxText(toText(maxCents));
    }
  }

  /**
   * A thumb moved: its box follows, always with the same text shape ("12.00"). Even at the very end of the
   * slider the box shows the number: swapping it for the grey placeholder there would flash. "No limit" is
   * decided when the thumb is released (see commit).
   */
  function handleMove(which: "min" | "max", cents: number) {
    const next = moveThumb(which, cents, thumbMin, thumbMax); // the thumbs cannot cross
    if (which === "min") setMinText(centsToEuros(next));
    else setMaxText(centsToEuros(next));
    setError(null);
  }

  const placeholderMin = range ? centsToEuros(range.minCents) : "";
  const placeholderMax = range ? centsToEuros(range.maxCents) : "";

  return (
    <div className={styles.price}>
      <PriceSlider
        lo={lo}
        hi={hi}
        min={thumbMin}
        max={thumbMax}
        disabled={range === null}
        onMove={handleMove}
        onRelease={() => commit(true)}
      />
      <div className={styles.inputs}>
        <input
          type="text"
          inputMode="decimal"
          className={styles.input}
          value={minText}
          placeholder={placeholderMin}
          aria-label="Minimum price in euros"
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setMinText(event.target.value);
            setError(null);
          }}
          onBlur={() => commit()}
          onKeyDown={(event) => event.key === "Enter" && commit()}
        />
        <span className={styles.dash} aria-hidden="true">
          –
        </span>
        <input
          type="text"
          inputMode="decimal"
          className={styles.input}
          value={maxText}
          placeholder={placeholderMax}
          aria-label="Maximum price in euros"
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setMaxText(event.target.value);
            setError(null);
          }}
          onBlur={() => commit()}
          onKeyDown={(event) => event.key === "Enter" && commit()}
        />
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
