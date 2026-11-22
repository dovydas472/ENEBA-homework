import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { productListQuery } from "../api/queries.ts";
import { Button } from "../components/Button.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorState } from "../components/ErrorState.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { VisuallyHidden } from "../components/VisuallyHidden.tsx";
import { ActiveFilters } from "../features/store/ActiveFilters.tsx";
import { FilterDrawer } from "../features/store/FilterDrawer.tsx";
import { FilterGroup } from "../features/store/FilterGroup.tsx";
import { FilterPanel } from "../features/store/FilterPanel.tsx";
import { FilterSidebar } from "../features/store/FilterSidebar.tsx";
import { Pagination } from "../features/store/Pagination.tsx";
import { ProductGrid, ProductGridSkeleton } from "../features/store/ProductGrid.tsx";
import { SortRadios } from "../features/store/SortRadios.tsx";
import { SortSelect } from "../features/store/SortSelect.tsx";
import { cx } from "../lib/cx.ts";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { useStoreParams } from "../lib/useStoreParams.ts";
import styles from "./StorePage.module.css";

/** "108 results", "1 result". */
function resultsText(total: number): string {
  return `${total} ${total === 1 ? "result" : "results"}`;
}

/**
 * The catalog (DESIGN.md 3.2), laid out like Eneba's store page (Task 11b):
 *  - desktop: filters on the left; on the right the active-filter chips, a bar with the result count and the sort,
 *    the product grid and the pagination;
 *  - phones / tablets (≤ 930 px): the count, then a "Sort and filter (n)" pill (opens the drawer with the sort
 *    and the filters) next to the chips, then the list.
 *
 * The URL is the single source of truth (useStoreParams): every filter / sort / page change writes the URL,
 * the URL gives new query params, and the new params give a new request. There is no filter state in React,
 * so reload, Back and shared links always show the same page.
 */
export function StorePage() {
  useDocumentTitle("Store");

  const { params, setParams } = useStoreParams();
  // `q` (the header search) is not sent to the API yet (S10); everything else is the listing request.
  const { q, ...filters } = params;

  const query = useQuery({
    ...productListQuery(filters),
    // While the request for NEW params is running, `data` keeps the previous result (and isPlaceholderData is true)
    // instead of becoming undefined. So the grid never disappears between two filter clicks: no flicker, no layout jump.
    placeholderData: keepPreviousData,
  });
  const data = query.data;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const resultsTop = useRef<HTMLDivElement>(null);

  const activeFilterCount =
    (params.platform?.length ?? 0) +
    (params.region?.length ?? 0) +
    (params.minPrice !== undefined || params.maxPrice !== undefined ? 1 : 0);

  /** Removes every filter. The sort and the search text stay: they are not filters. */
  function clearFilters() {
    setParams({ platform: undefined, region: undefined, minPrice: undefined, maxPrice: undefined });
  }

  /** Changes the page and brings the top of the results into view (owner decision S5). */
  function goToPage(page: number) {
    setParams({ page: page === 1 ? undefined : page });
    resultsTop.current?.scrollIntoView({ block: "start" });
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  /** What fills the area under the bar: skeleton, error, "nothing here" or the products. */
  function renderResults() {
    if (!data) {
      if (query.isError) {
        // A generic message: the real error is never shown to the user.
        return (
          <ErrorState
            message="We could not load the products."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        );
      }
      return <ProductGridSkeleton />;
    }

    if (data.items.length === 0) {
      if (data.total > 0) {
        // The page number in the URL is past the last page (e.g. an old bookmark).
        return (
          <EmptyState title="That page does not exist" message={`There are only ${totalPages} pages of results.`}>
            <Button variant="secondary" onClick={() => goToPage(1)}>
              Go to the first page
            </Button>
          </EmptyState>
        );
      }
      return (
        <EmptyState
          title="No products match these filters"
          message="Try removing a filter or choosing a different price range."
        >
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        </EmptyState>
      );
    }

    return (
      <>
        <ProductGrid items={data.items} dimmed={query.isPlaceholderData} />
        <Pagination page={data.page} totalPages={totalPages} onPageChange={goToPage} />
      </>
    );
  }

  const filterPanel = <FilterPanel facets={data?.facets} params={params} onChange={setParams} />;
  const sort = params.sort ?? "popularity";
  // "Most popular" is the default: it is left out of the URL.
  const changeSort = (next: typeof sort) => setParams({ sort: next === "popularity" ? undefined : next });

  return (
    <div>
      <h1 className={styles.title}>Store</h1>

      {q && (
        <p className={styles.notice} role="note">
          Text search arrives in a later task – showing all products.
        </p>
      )}

      <div className={styles.layout}>
        <FilterSidebar>{filterPanel}</FilterSidebar>

        <div className={styles.results}>
          {/* scrollIntoView target after a page change: the top of the chips + bar. */}
          <div ref={resultsTop} className={styles.head}>
            {/* Desktop: the chips row (when a filter is active). Phones: the drawer pill + the chips in one row. */}
            <div className={cx(styles.toolbar, activeFilterCount === 0 && styles.toolbarEmpty)}>
              <button type="button" className={styles.filtersButton} onClick={() => setDrawerOpen(true)}>
                <SlidersHorizontal aria-hidden="true" className={styles.filtersIcon} />
                Sort and filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
              {activeFilterCount > 0 && (
                <div className={styles.chips}>
                  <ActiveFilters params={params} facets={data?.facets} onChange={setParams} onClearAll={clearFilters} />
                </div>
              )}
            </div>
            {/* Count + sort. On phones CSS moves it above the pill row (the count is not focusable, so the tab order
                still matches what is seen). */}
            <div className={styles.bar}>
              {/* aria-live: a screen reader announces the new count after every filter change. */}
              <p className={styles.count} aria-live="polite" aria-atomic="true">
                {data ? resultsText(data.total) : ""}
              </p>
              {query.isPlaceholderData && (
                <span className={styles.updating}>
                  <Spinner />
                  <VisuallyHidden>Updating results</VisuallyHidden>
                </span>
              )}
              <SortSelect className={styles.sort} value={sort} onChange={changeSort} />
            </div>
          </div>

          <h2>
            <VisuallyHidden>Products</VisuallyHidden>
          </h2>
          {renderResults()}
        </div>
      </div>

      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} resultCount={data?.total}>
        {/* Sort first, as on Eneba; on desktop the sort is the select in the bar instead. */}
        <FilterGroup title="Sort by">
          <SortRadios value={sort} onChange={changeSort} />
        </FilterGroup>
        {filterPanel}
      </FilterDrawer>
    </div>
  );
}
