// @vitest-environment jsdom
// useSlowRequests is tested with a REAL QueryClient and a request that we finish by hand;
// time is faked, so the test is instant and not flaky.
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../test-utils.tsx";
import { SLOW_AFTER_MS, useSlowRequests } from "./useSlowRequests.ts";

let slow: boolean; // latest value returned by the hook
let finishRequest: () => void; // resolves the pending fake request
let cleanup: (() => void) | undefined;

function SlowProbe() {
  const value = useSlowRequests();
  useEffect(() => {
    slow = value;
  });
  return null;
}

function Request() {
  useQuery({
    queryKey: ["fake"],
    queryFn: () => new Promise<string>((resolve) => (finishRequest = () => resolve("done"))),
  });
  return null;
}

function mount(withRequest: boolean) {
  const client = new QueryClient();
  cleanup = render(
    <QueryClientProvider client={client}>
      <SlowProbe />
      {withRequest && <Request />}
    </QueryClientProvider>,
  ).unmount;
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});

describe("useSlowRequests", () => {
  it("is false when nothing is loading", async () => {
    mount(false);
    await advance(SLOW_AFTER_MS * 2);
    expect(slow).toBe(false);
  });

  it("stays false while a request is still younger than the threshold", async () => {
    mount(true);
    await advance(SLOW_AFTER_MS - 100);
    expect(slow).toBe(false);
  });

  it("becomes true when a request is still pending after the threshold", async () => {
    mount(true);
    await advance(SLOW_AFTER_MS + 100);
    expect(slow).toBe(true);
  });

  it("goes back to false as soon as the request finishes", async () => {
    mount(true);
    await advance(SLOW_AFTER_MS + 100);
    expect(slow).toBe(true);
    await act(async () => finishRequest());
    await advance(50);
    expect(slow).toBe(false);
  });

  it("a fast request never turns it on", async () => {
    mount(true);
    await advance(200);
    await act(async () => finishRequest());
    await advance(SLOW_AFTER_MS * 2);
    expect(slow).toBe(false);
  });
});
