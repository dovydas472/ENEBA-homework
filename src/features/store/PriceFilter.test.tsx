// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fire, pressKey, render, setControlValue } from "../../test-utils.tsx";
import { PriceFilter } from "./PriceFilter.tsx";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

const range = { minCents: 549, maxCents: 5099 }; // slider from 500 to 5100

interface Options {
  range?: typeof range | null;
  minCents?: number;
  maxCents?: number;
}

function renderFilter({ range: r = range, minCents, maxCents }: Options = {}) {
  const onApply = vi.fn();
  const view = render(<PriceFilter range={r} minCents={minCents} maxCents={maxCents} onApply={onApply} />);
  cleanup = view.unmount;
  const q = (label: string) => view.container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  return {
    ...view,
    onApply,
    minBox: q("Minimum price in euros"),
    maxBox: q("Maximum price in euros"),
    minThumb: q("Minimum price"),
    maxThumb: q("Maximum price"),
    alert: () => view.container.querySelector("[role=alert]")?.textContent ?? null,
  };
}

const release = (thumb: HTMLInputElement) => fire(thumb, new Event("pointerup", { bubbles: true }));
const blur = (input: HTMLInputElement) => {
  act(() => input.focus());
  act(() => input.blur());
};

describe("PriceFilter: boxes", () => {
  it("converts euros to cents when a box is left (blur)", () => {
    const { minBox, maxBox, onApply } = renderFilter();
    setControlValue(minBox, "10");
    setControlValue(maxBox, "25.50");
    blur(maxBox);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(1000, 2550);
  });

  it("applies on Enter, and not on every keystroke", () => {
    const { minBox, onApply } = renderFilter();
    setControlValue(minBox, "1");
    setControlValue(minBox, "12");
    expect(onApply).not.toHaveBeenCalled();
    pressKey(minBox, "Enter");
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(1200, undefined);
  });

  it("accepts a comma as the decimal separator", () => {
    const { maxBox, onApply } = renderFilter();
    setControlValue(maxBox, "7,5");
    pressKey(maxBox, "Enter");
    expect(onApply).toHaveBeenCalledWith(undefined, 750);
  });

  it("an empty box means no limit", () => {
    const { minBox, onApply } = renderFilter({ minCents: 1000, maxCents: 2000 });
    setControlValue(minBox, "");
    pressKey(minBox, "Enter");
    expect(onApply).toHaveBeenCalledWith(undefined, 2000);
  });

  it("shows a message for text that is not an amount, and makes no request", () => {
    const { minBox, onApply, alert } = renderFilter();
    setControlValue(minBox, "abc");
    pressKey(minBox, "Enter");
    expect(onApply).not.toHaveBeenCalled();
    expect(alert()).toContain("Enter an amount");
    expect(minBox.getAttribute("aria-invalid")).toBe("true");
    expect(minBox.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("shows a message when min > max, and makes no request", () => {
    const { minBox, maxBox, onApply, alert } = renderFilter();
    setControlValue(minBox, "30");
    setControlValue(maxBox, "10");
    pressKey(maxBox, "Enter");
    expect(onApply).not.toHaveBeenCalled();
    expect(alert()).toBe("The minimum price cannot be higher than the maximum.");
  });

  it("removes the message as soon as the user edits a box", () => {
    const { minBox, alert } = renderFilter();
    setControlValue(minBox, "abc");
    pressKey(minBox, "Enter");
    expect(alert()).not.toBeNull();
    setControlValue(minBox, "ab");
    expect(alert()).toBeNull();
  });

  it("does not ask again when nothing changed (e.g. just tabbing through the box)", () => {
    const { minBox, onApply } = renderFilter({ minCents: 1000 });
    blur(minBox);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("shows the applied limits in the boxes and the facet range as placeholders", () => {
    const { minBox, maxBox } = renderFilter({ minCents: 1250, maxCents: 3000 });
    expect(minBox.value).toBe("12.50");
    expect(maxBox.value).toBe("30.00");
    cleanup?.();

    const empty = renderFilter();
    expect(empty.minBox.placeholder).toBe("5.49");
    expect(empty.maxBox.placeholder).toBe("50.99");
  });
});

describe("PriceFilter: slider", () => {
  it("has labelled thumbs with euro values for screen readers", () => {
    const { minThumb, maxThumb } = renderFilter({ minCents: 1000, maxCents: 2000 });
    expect(minThumb.getAttribute("aria-valuetext")).toBe("€10.00");
    expect(maxThumb.getAttribute("aria-valuetext")).toBe("€20.00");
    expect(minThumb.type).toBe("range");
  });

  it("uses the facet range rounded to €0.50 steps, with a €0.50 step", () => {
    const { minThumb, maxThumb } = renderFilter();
    for (const thumb of [minThumb, maxThumb]) {
      expect(thumb.min).toBe("500");
      expect(thumb.max).toBe("5100");
      expect(thumb.step).toBe("50");
    }
    expect(minThumb.value).toBe("500"); // no limit = the thumb sits at the end
    expect(maxThumb.value).toBe("5100");
  });

  it("dragging a thumb updates the box live, without a request", () => {
    const { minThumb, minBox, onApply } = renderFilter();
    setControlValue(minThumb, "1000");
    expect(minBox.value).toBe("10.00");
    setControlValue(minThumb, "1050");
    expect(minBox.value).toBe("10.50");
    expect(onApply).not.toHaveBeenCalled();
  });

  it("releasing the thumb makes exactly ONE update, with the final value", () => {
    const { minThumb, onApply } = renderFilter();
    setControlValue(minThumb, "800");
    setControlValue(minThumb, "900");
    setControlValue(minThumb, "1000");
    release(minThumb);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(1000, undefined);
  });

  it("a key press on a thumb updates once, when the key is released; Tab does not", () => {
    const { maxThumb, onApply } = renderFilter();
    setControlValue(maxThumb, "4900");
    fire(maxThumb, new KeyboardEvent("keyup", { key: "Tab", bubbles: true }));
    expect(onApply).not.toHaveBeenCalled();
    fire(maxThumb, new KeyboardEvent("keyup", { key: "ArrowLeft", bubbles: true }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(undefined, 4900);
  });

  it("a thumb released at the end of the slider means 'no limit' (the box is emptied then, not while dragging)", () => {
    const { minThumb, minBox, onApply } = renderFilter({ minCents: 1000 });
    setControlValue(minThumb, "500");
    expect(minBox.value).toBe("5.00"); // still a number while dragging: no flash to the grey placeholder
    release(minThumb);
    expect(onApply).toHaveBeenCalledWith(undefined, undefined);
  });

  it("a thumb dragged away and back to where it started applies nothing and shows the applied limits again", () => {
    const { minThumb, minBox, onApply } = renderFilter();
    setControlValue(minThumb, "900");
    setControlValue(minThumb, "500");
    release(minThumb);
    expect(onApply).not.toHaveBeenCalled();
    expect(minBox.value).toBe(""); // no limit: the placeholder is back
  });

  it("the thumbs cannot cross: the minimum thumb stops at the maximum thumb", () => {
    const { minThumb, minBox, onApply } = renderFilter({ minCents: 1000, maxCents: 2000 });
    setControlValue(minThumb, "3000");
    expect(minBox.value).toBe("20.00");
    expect(minThumb.value).toBe("2000");
    release(minThumb);
    expect(onApply).toHaveBeenCalledWith(2000, 2000);
  });

  it("the thumbs cannot cross: the maximum thumb stops at the minimum thumb", () => {
    const { maxThumb, maxBox } = renderFilter({ minCents: 1000, maxCents: 2000 });
    setControlValue(maxThumb, "600");
    expect(maxBox.value).toBe("10.00");
    expect(maxThumb.value).toBe("1000");
  });

  it("typing in a box moves its thumb", () => {
    const { minBox, maxBox, minThumb, maxThumb } = renderFilter();
    setControlValue(minBox, "12.50");
    setControlValue(maxBox, "30");
    expect(minThumb.value).toBe("1250");
    expect(maxThumb.value).toBe("3000");
  });

  it("is disabled when there is no price range (nothing in stock)", () => {
    const { minThumb, maxThumb, minBox } = renderFilter({ range: null });
    expect(minThumb.disabled).toBe(true);
    expect(maxThumb.disabled).toBe(true);
    expect(minBox.placeholder).toBe("");
  });

  it("follows the applied limits when they change from outside (e.g. 'Clear all')", () => {
    const onApply = vi.fn();
    const view = render(<PriceFilter range={range} minCents={1000} maxCents={2000} onApply={onApply} />);
    cleanup = view.unmount;
    const box = () => view.container.querySelector<HTMLInputElement>("[aria-label='Minimum price in euros']")!;
    expect(box().value).toBe("10.00");
    view.rerender(<PriceFilter range={range} onApply={onApply} />);
    expect(box().value).toBe("");
  });
});

// Regression: the boxes flickered while a thumb was dragged. Measured in a real browser the cause was the TEXT: it
// changed length on every other step ("49" -> "48.50" -> "48"), so its width jumped by up to 30 px between frames.
// The boxes themselves were never re-mounted and showed no focus / error styles; these tests keep it that way.
describe("PriceFilter: dragging a thumb does not make the boxes flicker", () => {
  /** Drags a thumb through many values, one `input` event each (what the browser fires while dragging). */
  function drag(thumb: HTMLInputElement, from: number, to: number, step = 50) {
    const seen: string[] = [];
    for (let v = from; v !== to; v += from < to ? step : -step) {
      setControlValue(thumb, String(v));
      seen.push(thumb.value);
    }
    return seen;
  }

  it("keeps the same <input> elements (no re-mount) for the whole drag", () => {
    const { container, minBox, maxBox, maxThumb } = renderFilter();
    drag(maxThumb, 5100, 1500);
    expect(container.querySelector("[aria-label='Minimum price in euros']")).toBe(minBox);
    expect(container.querySelector("[aria-label='Maximum price in euros']")).toBe(maxBox);
  });

  it("shows no error and no invalid state at any step of the drag", () => {
    const { minBox, maxBox, minThumb, maxThumb, alert } = renderFilter();
    const drags: [HTMLInputElement, number, number][] = [
      [maxThumb, 5100, 600],
      [minThumb, 500, 5000],
    ];
    for (const [thumb, from, to] of drags) {
      for (let v = from; v !== to; v += from < to ? 50 : -50) {
        setControlValue(thumb, String(v));
        expect(alert()).toBeNull();
        expect(minBox.getAttribute("aria-invalid")).toBeNull();
        expect(maxBox.getAttribute("aria-invalid")).toBeNull();
      }
    }
  });

  it("the text keeps the same shape at every step (same length, always two decimals)", () => {
    const { maxBox, maxThumb } = renderFilter();
    const texts: string[] = [];
    for (let v = 4900; v >= 1000; v -= 50) {
      setControlValue(maxThumb, String(v));
      texts.push(maxBox.value);
    }
    expect(texts.length).toBeGreaterThan(70);
    for (const text of texts) expect(text).toMatch(/^\d+\.\d{2}$/);
    expect(new Set(texts.map((t) => t.length))).toEqual(new Set([5])); // "49.00" ... "10.00"
  });

  it("does not swap the box for the placeholder when the thumb touches the end of the slider", () => {
    const { minBox, maxBox, minThumb, maxThumb } = renderFilter({ minCents: 1000, maxCents: 2000 });
    setControlValue(maxThumb, "5100"); // the very end
    expect(maxBox.value).toBe("51.00");
    setControlValue(minThumb, "500"); // the very start
    expect(minBox.value).toBe("5.00");
  });

  it("makes no request and keeps focus out of the boxes while dragging", () => {
    const { minBox, maxBox, maxThumb, onApply } = renderFilter();
    drag(maxThumb, 5100, 2000);
    expect(onApply).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(minBox);
    expect(document.activeElement).not.toBe(maxBox);
  });
});

