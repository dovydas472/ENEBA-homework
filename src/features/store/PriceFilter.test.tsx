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
    expect(maxBox.value).toBe("30");
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
    expect(minBox.value).toBe("10");
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

  it("a thumb at the end of the slider means 'no limit' (the box is emptied)", () => {
    const { minThumb, minBox, onApply } = renderFilter({ minCents: 1000 });
    setControlValue(minThumb, "500");
    expect(minBox.value).toBe("");
    release(minThumb);
    expect(onApply).toHaveBeenCalledWith(undefined, undefined);
  });

  it("the thumbs cannot cross: the minimum thumb stops at the maximum thumb", () => {
    const { minThumb, minBox, onApply } = renderFilter({ minCents: 1000, maxCents: 2000 });
    setControlValue(minThumb, "3000");
    expect(minBox.value).toBe("20");
    expect(minThumb.value).toBe("2000");
    release(minThumb);
    expect(onApply).toHaveBeenCalledWith(2000, 2000);
  });

  it("the thumbs cannot cross: the maximum thumb stops at the minimum thumb", () => {
    const { maxThumb, maxBox } = renderFilter({ minCents: 1000, maxCents: 2000 });
    setControlValue(maxThumb, "600");
    expect(maxBox.value).toBe("10");
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
    expect(box().value).toBe("10");
    view.rerender(<PriceFilter range={range} onApply={onApply} />);
    expect(box().value).toBe("");
  });
});
