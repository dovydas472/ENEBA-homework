// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../test-utils.tsx";
import { useDebouncedValue } from "./useDebouncedValue.ts";

let shown: string[] = [];
function Probe({ value }: { value: string }) {
  shown.push(useDebouncedValue(value, 200));
  return null;
}

let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  shown = [];
});
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});

describe("useDebouncedValue", () => {
  it("starts with the first value", () => {
    const view = render(<Probe value="a" />);
    cleanup = view.unmount;
    expect(shown.at(-1)).toBe("a");
  });

  it("gives a new value only after it stopped changing for the delay", () => {
    const view = render(<Probe value="w" />);
    cleanup = view.unmount;
    view.rerender(<Probe value="wi" />);
    act(() => vi.advanceTimersByTime(150));
    view.rerender(<Probe value="wit" />); // restarts the timer
    act(() => vi.advanceTimersByTime(150));
    expect(shown.at(-1)).toBe("w"); // 300 ms in total, but never 200 ms without a change
    act(() => vi.advanceTimersByTime(50));
    expect(shown.at(-1)).toBe("wit");
    expect(shown).not.toContain("wi"); // the in-between value was skipped
  });
});
