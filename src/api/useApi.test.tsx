// @vitest-environment jsdom
// (jsdom gives us a DOM so React can render the hook; the other test file runs without it.)
//
// Tests for the `slow` signal of useApi. The hook is rendered through a tiny probe
// component, fetch is a fake that we answer by hand, and time is faked, so the test
// runs instantly and is not flaky.
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOW_AFTER_MS, useApi } from "./useApi.ts";

// Tell React that this environment is a test (enables act() and silences its warning).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Answer = { status: number; body: string };
type ApiState = ReturnType<typeof useApi<{ ok: boolean }>>;

let root: Root;
let latest: ApiState; // what the hook returned in the most recent render
let answers: ((a: Answer) => void)[]; // one resolver per fetch call, in call order

function Probe({ path }: { path: string }) {
  const state = useApi<{ ok: boolean }>(path);
  // Record the result in an effect (not during render: render must stay free of side effects).
  useEffect(() => {
    latest = state;
  });
  return null;
}

/** Render the probe with `path` (inside act so effects and state updates are flushed). */
async function render(path = "/api/health") {
  await act(async () => {
    root.render(createElement(Probe, { path }));
  });
}

/** Let `ms` of fake time pass. */
async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Answer the n-th fetch call (0 = first). */
async function answer(n: number, a: Answer) {
  await act(async () => {
    answers[n](a);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  answers = [];
  // A fetch that stays pending until the test answers it. apiFetch only uses ok/status/text().
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          answers.push(({ status, body }) =>
            resolve({ ok: status >= 200 && status < 300, status, text: async () => body }),
          );
        }),
    ),
  );
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useApi", () => {
  it("starts in the loading state, not slow", async () => {
    await render();

    expect(latest.loading).toBe(true);
    expect(latest.slow).toBe(false);
    expect(latest.data).toBeNull();
  });

  it("becomes slow only after SLOW_AFTER_MS of waiting", async () => {
    await render();

    await elapse(SLOW_AFTER_MS - 1);
    expect(latest.slow).toBe(false);

    await elapse(1);
    expect(latest.slow).toBe(true);
    expect(latest.loading).toBe(true);
  });

  it("a fast answer never becomes slow", async () => {
    await render();

    await answer(0, { status: 200, body: '{"ok":true}' });
    expect(latest.loading).toBe(false);
    expect(latest.slow).toBe(false);
    expect(latest.data).toEqual({ ok: true });

    // The slow timer was cancelled, so nothing flips later either.
    await elapse(SLOW_AFTER_MS * 2);
    expect(latest.slow).toBe(false);
  });

  it("slow goes back to false when the slow answer finally arrives", async () => {
    await render();
    await elapse(SLOW_AFTER_MS);
    expect(latest.slow).toBe(true);

    await answer(0, { status: 200, body: '{"ok":true}' });

    expect(latest.loading).toBe(false);
    expect(latest.slow).toBe(false);
    expect(latest.data).toEqual({ ok: true });
  });

  it("exposes an error and retry() starts a fresh, not-yet-slow request", async () => {
    await render();
    await answer(0, { status: 503, body: '{"db":"error"}' });
    expect(latest.error?.status).toBe(503);
    expect(latest.loading).toBe(false);

    await act(async () => latest.retry());

    expect(answers).toHaveLength(2); // a second request was sent
    expect(latest.loading).toBe(true);
    expect(latest.error).toBeNull();
    expect(latest.slow).toBe(false);

    await elapse(SLOW_AFTER_MS);
    expect(latest.slow).toBe(true); // the new request has its own slow timer
  });

  it("a new path starts a new request that is loading and not slow", async () => {
    await render("/api/a");
    await elapse(SLOW_AFTER_MS);
    expect(latest.slow).toBe(true);

    await render("/api/b");

    expect(answers).toHaveLength(2);
    expect(latest.loading).toBe(true);
    expect(latest.slow).toBe(false);
  });
});
