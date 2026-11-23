// @vitest-environment jsdom
// The hero carousel: slides, LCP picture, autoplay (6 s), pause on hover / focus, reduced motion, keyboard.
// The block's data is put into the query cache up front, so no request is made; timers are fake.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../api/client.ts";
import { queryKeys } from "../../api/queries.ts";
import type { HeroBlockData } from "../../api/types.ts";
import { render } from "../../test-utils.tsx";
import { hero } from "./fixtures.ts";
import { HeroCarousel } from "./HeroCarousel.tsx";
import { AUTOPLAY_MS, SWIPE_MIN_PX, swipeDirection } from "./useCarousel.ts";

vi.mock("../../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client.ts")>()),
  apiFetch: vi.fn(),
}));

const block = { key: "hero", type: "hero", title: "Featured", endpoint: "/api/blocks/hero" };

/** A fake matchMedia for "(prefers-reduced-motion: reduce)"; `set` flips it like the OS setting would. */
function fakeReducedMotion(matches: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  window.matchMedia = vi.fn(() => mql) as never;
  return {
    set(value: boolean) {
      mql.matches = value;
      act(() => listeners.forEach((l) => l()));
    },
  };
}

let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(apiFetch).mockReset();
  fakeReducedMotion(false);
});
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});

function mount(data: HeroBlockData = hero) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(queryKeys.homeBlock(block.endpoint), data);
  const router = createMemoryRouter([{ path: "/", element: <HeroCarousel block={block} /> }]);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
}

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const $$ = <T extends Element = HTMLElement>(selector: string) => [...document.querySelectorAll<T>(selector)];
const carousel = () => $("section[aria-roledescription=carousel]");
const slides = () => $$("[aria-roledescription=slide]");
/** Index of the slide on screen (the only one that is not aria-hidden). */
const active = () => slides().findIndex((s) => s.getAttribute("aria-hidden") === "false");
const button = (label: string) => $<HTMLButtonElement>(`button[aria-label="${label}"]`);
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const click = (el: HTMLElement) => act(() => el.click());
const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });

describe("HeroCarousel", () => {
  it("is a named carousel region; each slide is a group 'n of 3'; hidden slides are inert and hidden from screen readers", () => {
    mount();
    expect(carousel().getAttribute("aria-label")).toBe("Featured");
    expect(slides().map((s) => s.getAttribute("aria-label"))).toEqual(["1 of 3", "2 of 3", "3 of 3"]);
    expect(active()).toBe(0);
    for (const hidden of slides().slice(1)) {
      expect(hidden.getAttribute("aria-hidden")).toBe("true");
      expect(hidden.hasAttribute("inert")).toBe(true); // its "Buy now" cannot be reached with Tab
    }
    expect(slides()[0].hasAttribute("inert")).toBe(false);
  });

  it("the first picture is the LCP: eager, fetchpriority=high, responsive srcset; the others load lazily", () => {
    mount();
    const [first, second] = $$<HTMLImageElement>("[aria-roledescription=slide] img");
    expect(first.getAttribute("loading")).toBe("eager");
    expect(first.getAttribute("fetchpriority")).toBe("high");
    expect(first.getAttribute("srcset")).toBe(hero.slides[0].image.srcset);
    expect(first.getAttribute("sizes")).toContain("100vw");
    expect(first.getAttribute("alt")).toBe(""); // decoration: the slide's heading says what it is
    expect(second.getAttribute("loading")).toBe("lazy");
    expect(second.getAttribute("fetchpriority")).toBe("auto");
    const phone = $("[aria-roledescription=slide] source");
    expect(phone.getAttribute("media")).toBe("(max-width: 600px)");
    expect(phone.getAttribute("srcset")).toBe(hero.slides[0].image.mobileSrcset);
  });

  it("shows the server's text: badge, title, subtitle; a product slide has the price and 'Buy now' to its product page", () => {
    mount();
    const [innert, gta] = slides();
    expect(innert.textContent).toBe("Coming soonINNERTRealms · Raids · Dragons");
    expect(innert.querySelector("a")).toBeNull(); // no button: nothing to link to
    const buy = gta.querySelector("a")!;
    expect(buy.getAttribute("href")).toBe("/product/grand-theft-auto-v-steam-global");
    expect(buy.textContent).toBe("Buy now: Grand Theft Auto V");
    expect(gta.textContent).toContain("€11.99");
  });

  it("autoplay: the next slide after 6 s, and it wraps around", () => {
    mount();
    wait(AUTOPLAY_MS - 1);
    expect(active()).toBe(0);
    wait(1);
    expect(active()).toBe(1);
    wait(AUTOPLAY_MS);
    expect(active()).toBe(2);
    wait(AUTOPLAY_MS);
    expect(active()).toBe(0);
  });

  it("pauses while the pointer is over the carousel and goes on when it leaves", () => {
    mount();
    act(() => {
      carousel().dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
    });
    wait(3 * AUTOPLAY_MS);
    expect(active()).toBe(0);
    act(() => {
      carousel().dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    });
    wait(AUTOPLAY_MS);
    expect(active()).toBe(1);
  });

  it("pauses while keyboard focus is inside (moving between its buttons does not count as leaving)", () => {
    mount();
    const outside = document.createElement("button");
    document.body.append(outside);
    act(() => button("Next slide").focus());
    act(() => button("Previous slide").focus());
    wait(3 * AUTOPLAY_MS);
    expect(active()).toBe(0);
    act(() => outside.focus());
    wait(AUTOPLAY_MS);
    expect(active()).toBe(1);
    outside.remove();
  });

  it("keyboard: Left / Right arrows change the slide (wrapping); the buttons and the dots work too", () => {
    mount();
    key(button("Next slide"), "ArrowRight");
    expect(active()).toBe(1);
    key(button("Next slide"), "ArrowLeft");
    key(button("Next slide"), "ArrowLeft");
    expect(active()).toBe(2); // wrapped from the first to the last

    click(button("Next slide"));
    expect(active()).toBe(0);
    click(button("Previous slide"));
    expect(active()).toBe(2);

    const dots = $$<HTMLButtonElement>("button[aria-label^='Slide ']");
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual([
      "Slide 1: INNERT",
      "Slide 2: Grand Theft Auto V",
      "Slide 3: The Witcher 3: Wild Hunt",
    ]);
    click(dots[1]);
    expect(active()).toBe(1);
    expect(dots.map((d) => d.getAttribute("aria-current"))).toEqual([null, "true", null]);
  });

  it("Pause stops the slide show for good (also after hover); Play starts it again", () => {
    mount();
    // The Play / Pause button is the first control in the Tab order (WAI-ARIA carousel pattern).
    expect(carousel().querySelector("button")?.getAttribute("aria-label")).toBe("Stop automatic slide show");
    click(button("Stop automatic slide show"));
    wait(3 * AUTOPLAY_MS);
    expect(active()).toBe(0);
    click(button("Start automatic slide show"));
    act(() => {
      carousel().dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    });
    wait(AUTOPLAY_MS);
    expect(active()).toBe(1);
  });

  it("announces slide changes only while it stands still (aria-live off while rotating)", () => {
    mount();
    const live = () => $("[aria-live]").getAttribute("aria-live");
    expect(live()).toBe("off");
    click(button("Stop automatic slide show"));
    expect(live()).toBe("polite");
  });

  it("prefers-reduced-motion: no autoplay; the user can still start it", () => {
    fakeReducedMotion(true);
    mount();
    wait(3 * AUTOPLAY_MS);
    expect(active()).toBe(0);
    click(button("Start automatic slide show"));
    act(() => {
      carousel().dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    });
    wait(AUTOPLAY_MS);
    expect(active()).toBe(1);
  });

  it("reacts when the reduce-motion setting changes while the page is open", () => {
    const setting = fakeReducedMotion(false);
    mount();
    setting.set(true);
    wait(3 * AUTOPLAY_MS);
    expect(active()).toBe(0);
  });

  it("a single slide has no controls and never rotates", () => {
    mount({ slides: [hero.slides[0]] });
    expect(carousel().querySelectorAll("button")).toHaveLength(0);
    expect($("[aria-live]").getAttribute("aria-live")).toBe("polite");
  });

  it("no slides: the block takes no space", () => {
    mount({ slides: [] });
    expect(document.querySelector("section[aria-roledescription=carousel]")).toBeNull();
  });
});

describe("swipe (Task 17)", () => {
  /** A finger (or mouse) going down at (x0, y0) and up at (x1, y1). React listens to pointerdown / pointerup. */
  function gesture(x0: number, y0: number, x1: number, y1: number, pointerType = "touch") {
    act(() => {
      carousel().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x0, clientY: y0, pointerType }));
      carousel().dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x1, clientY: y1, pointerType }));
    });
  }

  it("swipeDirection: long and mostly sideways = a swipe; left = next, right = previous", () => {
    expect(swipeDirection(-SWIPE_MIN_PX, 0)).toBe("next");
    expect(swipeDirection(SWIPE_MIN_PX + 10, 5)).toBe("prev");
    expect(swipeDirection(-(SWIPE_MIN_PX - 1), 0)).toBeNull(); // too short (a wobbly tap)
    expect(swipeDirection(-80, 120)).toBeNull(); // more vertical than sideways: the user is scrolling
    expect(swipeDirection(0, 0)).toBeNull();
  });

  it("a swipe to the left shows the next slide, to the right the previous one", () => {
    mount();
    gesture(300, 100, 200, 110);
    expect(active()).toBe(1);
    gesture(100, 100, 250, 95);
    expect(active()).toBe(0);
    gesture(100, 100, 250, 95); // wraps around like the arrows
    expect(active()).toBe(2);
  });

  it("a vertical scroll or a short wobble does not change the slide", () => {
    mount();
    gesture(200, 300, 170, 100); // mostly up: a page scroll
    gesture(200, 100, 180, 100); // 20 px: a tap that moved a little
    expect(active()).toBe(0);
  });

  it("pointercancel (the browser took over to scroll) forgets the gesture", () => {
    mount();
    act(() => {
      carousel().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 300, clientY: 100, pointerType: "touch" }));
      carousel().dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch" }));
      carousel().dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 100, clientY: 100, pointerType: "touch" }));
    });
    expect(active()).toBe(0);
  });

  it("a mouse drag is not a swipe (desktop has the arrow buttons)", () => {
    mount();
    gesture(300, 100, 100, 100, "mouse");
    expect(active()).toBe(0);
  });
});
