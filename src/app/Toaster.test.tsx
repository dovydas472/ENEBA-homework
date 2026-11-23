// @vitest-environment jsdom
// The toast: shown by showToast(), replaced by the next one, gone after 5 s unless hovered, closable with ×.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showToast } from "../lib/toast.ts";
import { fire, render } from "../test-utils.tsx";
import { TOAST_DURATION_MS, Toaster } from "./Toaster.tsx";

let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  const view = render(
    // The toast's link is a PrefetchLink (Task 17): it needs the query cache, like everywhere in the app.
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
});
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});

const region = () => document.querySelector("[role=status]")!;
const show = (message: string) => act(() => void showToast({ kind: "success", message, action: { label: "View cart", to: "/cart" } }));
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("Toaster", () => {
  it("is a live region that is always there, even when empty", () => {
    expect(region()).not.toBeNull();
    expect(region().textContent).toBe("");
  });

  it("shows the message and its link, and hides it after 5 s", () => {
    show("Added to cart");
    expect(region().textContent).toContain("Added to cart");
    expect(region().querySelector("a")?.getAttribute("href")).toBe("/cart");
    wait(TOAST_DURATION_MS - 1);
    expect(region().textContent).toContain("Added to cart");
    wait(1);
    expect(region().textContent).toBe("");
  });

  it("a new toast replaces the old one and gets its own 5 s", () => {
    show("Added to cart");
    wait(4_000);
    show("Maximum quantity reached");
    expect(region().textContent).not.toContain("Added to cart");
    wait(4_000);
    expect(region().textContent).toContain("Maximum quantity reached");
  });

  it("does not disappear while the pointer is on it", () => {
    show("Added to cart");
    const box = region().firstElementChild!;
    fire(box, new MouseEvent("mouseover", { bubbles: true }));
    wait(TOAST_DURATION_MS * 2);
    expect(region().textContent).toContain("Added to cart");
    fire(box, new MouseEvent("mouseout", { bubbles: true }));
    wait(TOAST_DURATION_MS);
    expect(region().textContent).toBe("");
  });

  it("closes with the × button", () => {
    show("Added to cart");
    act(() => region().querySelector<HTMLButtonElement>("button[aria-label=Dismiss]")!.click());
    expect(region().textContent).toBe("");
  });
});
