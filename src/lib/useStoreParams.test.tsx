// @vitest-environment jsdom
// The hook is rendered inside a real (in-memory) router, so we can check the URL it writes.
import { act, useEffect } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "../test-utils.tsx";
import { useStoreParams } from "./useStoreParams.ts";

type Store = ReturnType<typeof useStoreParams>;

let latest: Store; // what the hook returned in the most recent render
let cleanup: (() => void) | undefined;

function Probe() {
  const store = useStoreParams();
  useEffect(() => {
    latest = store;
  });
  return null;
}

/** Mounts the probe at `url` and returns the router (to read the URL / go back). */
function mount(url: string) {
  const router = createMemoryRouter([{ path: "/store", Component: Probe }], { initialEntries: ["/", url] });
  const view = render(<RouterProvider router={router} />);
  cleanup = view.unmount;
  return router;
}

const urlOf = (router: ReturnType<typeof mount>) => router.state.location.pathname + router.state.location.search;

afterEach(() => cleanup?.());

describe("useStoreParams", () => {
  it("reads the filters from the URL", () => {
    mount("/store?platform=steam,psn&sort=price_asc&page=2");
    expect(latest.params).toEqual({ platform: ["steam", "psn"], sort: "price_asc", page: 2 });
  });

  it("ignores invalid values in the URL", () => {
    mount("/store?sort=nonsense&page=-3");
    expect(latest.params).toEqual({});
  });

  it("writes a change to the URL (readable commas, fixed order) and re-reads it", () => {
    const router = mount("/store?sort=title");
    act(() => latest.setParams({ platform: ["steam", "psn"] }));
    expect(urlOf(router)).toBe("/store?platform=steam,psn&sort=title");
    expect(latest.params).toEqual({ platform: ["steam", "psn"], sort: "title" });
  });

  it("goes back to page 1 when a filter changes", () => {
    const router = mount("/store?platform=steam&page=3");
    act(() => latest.setParams({ region: ["global"] }));
    expect(urlOf(router)).toBe("/store?platform=steam&region=global");
  });

  it("removes a filter that is set to undefined", () => {
    const router = mount("/store?platform=steam&sort=title");
    act(() => latest.setParams({ platform: undefined }));
    expect(urlOf(router)).toBe("/store?sort=title");
  });

  it("adds a history entry, so the Back button undoes the change", async () => {
    const router = mount("/store?sort=title");
    act(() => latest.setParams({ sort: "newest" }));
    expect(urlOf(router)).toBe("/store?sort=newest");
    await act(() => router.navigate(-1));
    expect(urlOf(router)).toBe("/store?sort=title");
    expect(latest.params).toEqual({ sort: "title" });
  });

  it("can replace the history entry instead (for things like typing a price)", async () => {
    const router = mount("/store?sort=title");
    act(() => latest.setParams({ sort: "newest" }, { replace: true }));
    await act(() => router.navigate(-1));
    expect(urlOf(router)).toBe("/"); // went past the replaced entry
  });

  it("clears every filter with resetParams but keeps the page path", () => {
    const router = mount("/store?q=zelda&platform=steam&page=2");
    act(() => latest.resetParams());
    expect(urlOf(router)).toBe("/store");
  });
});
