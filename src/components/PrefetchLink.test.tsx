// @vitest-environment jsdom
// WHEN PrefetchLink prefetches: after the pointer rests 80 ms (not when it only passes over), at once on keyboard focus
// and on touchstart; the caller's own handlers still run. WHAT it prefetches is tested in src/app/prefetch.test.ts.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOVER_DELAY_MS } from "../app/prefetch.ts";
import { fire, render } from "../test-utils.tsx";
import { PrefetchLink } from "./PrefetchLink.tsx";

let cleanup: (() => void) | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount(extra: Partial<React.ComponentProps<typeof PrefetchLink>> = {}) {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <PrefetchLink to="/product/the-witcher-3" {...extra}>
          The Witcher 3
        </PrefetchLink>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
  return view.container.querySelector("a")!;
}

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const requested = () => fetchMock.mock.calls.map((call) => call[0]);
// React's onMouseEnter / onMouseLeave listen to mouseover / mouseout.
const pointerIn = (link: Element) => fire(link, new MouseEvent("mouseover", { bubbles: true }));
const pointerOut = (link: Element) => fire(link, new MouseEvent("mouseout", { bubbles: true }));

describe("PrefetchLink", () => {
  it("is a normal link", () => {
    const link = mount();
    expect(link.getAttribute("href")).toBe("/product/the-witcher-3");
    expect(link.textContent).toBe("The Witcher 3");
  });

  it("prefetches when the pointer rests on it for the hover delay", () => {
    const link = mount();
    pointerIn(link);
    wait(HOVER_DELAY_MS - 1);
    expect(requested()).toEqual([]);
    wait(1);
    expect(requested()).toEqual(["/api/products/the-witcher-3"]);
  });

  it("does NOT prefetch when the pointer leaves earlier (sweeping across a grid costs nothing)", () => {
    const link = mount();
    pointerIn(link);
    wait(HOVER_DELAY_MS / 2);
    pointerOut(link);
    wait(HOVER_DELAY_MS * 2);
    expect(requested()).toEqual([]);
  });

  it("prefetches at once on keyboard focus", () => {
    const link = mount();
    act(() => link.focus());
    expect(requested()).toEqual(["/api/products/the-witcher-3"]);
  });

  it("prefetches at once on touchstart (phones have no hover)", () => {
    const link = mount();
    fire(link, new Event("touchstart", { bubbles: true }));
    expect(requested()).toEqual(["/api/products/the-witcher-3"]);
  });

  it("asks once although hover, focus and touch all happen", () => {
    const link = mount();
    fire(link, new Event("touchstart", { bubbles: true }));
    act(() => link.focus());
    pointerIn(link);
    wait(HOVER_DELAY_MS);
    expect(requested()).toEqual(["/api/products/the-witcher-3"]);
  });

  it("still calls the caller's own handlers", () => {
    const onMouseEnter = vi.fn();
    const onMouseLeave = vi.fn();
    const onFocus = vi.fn();
    const onTouchStart = vi.fn();
    const link = mount({ onMouseEnter, onMouseLeave, onFocus, onTouchStart });
    pointerIn(link);
    pointerOut(link);
    act(() => link.focus());
    fire(link, new Event("touchstart", { bubbles: true }));
    expect([onMouseEnter, onMouseLeave, onFocus, onTouchStart].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it("a link removed while the pointer rests on it does not prefetch afterwards", () => {
    const link = mount();
    pointerIn(link);
    cleanup?.();
    cleanup = undefined;
    wait(HOVER_DELAY_MS * 2);
    expect(requested()).toEqual([]);
  });
});
