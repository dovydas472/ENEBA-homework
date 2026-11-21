import { useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { buildStoreSearch, mergeStoreParams, parseStoreParams, type StoreParams } from "./storeParams.ts";

export interface SetParamsOptions {
  /** Replace the current history entry instead of adding one (use it for things like typing a price). */
  replace?: boolean;
}

/**
 * The Store filters, read from and written to the URL. The URL is the single source of truth:
 * there is no copy in React state, so reload, Back/Forward and shared links always agree with the screen.
 *
 *   const { params, setParams, resetParams } = useStoreParams();
 *   setParams({ platform: ["steam"] });   // -> /store?platform=steam (page goes back to 1)
 *
 * Reading uses useSearchParams. Writing goes through navigate() with a string we build ourselves
 * (buildStoreSearch), because setSearchParams would turn the commas into %2C.
 *
 * Every write passes `preventScrollReset: true`: <ScrollRestoration /> (in Layout) would otherwise jump to the top
 * of the page whenever the URL changes, e.g. while the user ticks several platforms. The Store page scrolls
 * to the results itself when the PAGE changes. Back/Forward still restore the saved scroll position.
 */
export function useStoreParams() {
  const [searchParams] = useSearchParams();

  // URLSearchParams is a new object on every render; its text is stable, so memoize on that.
  const search = searchParams.toString();
  const params = useMemo(() => parseStoreParams(new URLSearchParams(search)), [search]);

  const navigate = useNavigate();

  const setParams = useCallback(
    (patch: Partial<StoreParams>, options: SetParamsOptions = {}) => {
      // Only `search` is given, so the path stays the same (we are on /store).
      navigate(
        { search: buildStoreSearch(mergeStoreParams(params, patch)) },
        { replace: options.replace, preventScrollReset: true },
      );
    },
    [navigate, params],
  );

  const resetParams = useCallback(() => navigate({ search: "" }, { preventScrollReset: true }), [navigate]);

  return { params, setParams, resetParams };
}
