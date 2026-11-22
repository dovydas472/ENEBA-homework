import type { Facets } from "../../api/types.ts";
import { Skeleton } from "../../components/Skeleton.tsx";
import type { StoreParams } from "../../lib/storeParams.ts";
import { CheckboxFilter } from "./CheckboxFilter.tsx";
import { FilterGroup } from "./FilterGroup.tsx";
import styles from "./FilterPanel.module.css";
import { PriceFilter } from "./PriceFilter.tsx";

interface FilterPanelProps {
  /** Filter options + counts for the current result. undefined = the first load is still running. */
  facets: Facets | undefined;
  params: StoreParams;
  /** Writes a change to the URL (the page goes back to 1 by itself). */
  onChange: (patch: Partial<StoreParams>, options?: { replace?: boolean }) => void;
}

/**
 * The three filter groups, in Eneba's order: Price range first, then Platform and Region.
 * The desktop sidebar and the mobile drawer both show this same component, so the two can never differ.
 */
export function FilterPanel({ facets, params, onChange }: FilterPanelProps) {
  // First load: three grey bars instead of checkboxes (DESIGN.md 4.8, "Loading").
  if (!facets) {
    return (
      <>
        {["Price range (EUR)", "Platform", "Region"].map((title) => (
          <FilterGroup key={title} title={title}>
            <div className={styles.skeleton} aria-hidden="true">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          </FilterGroup>
        ))}
      </>
    );
  }

  return (
    <>
      <FilterGroup title="Price range (EUR)">
        <PriceFilter
          range={facets.priceRange}
          minCents={params.minPrice}
          maxCents={params.maxPrice}
          // replace: dragging or typing a price must not fill the history with one entry per change.
          onApply={(minPrice, maxPrice) => onChange({ minPrice, maxPrice }, { replace: true })}
        />
      </FilterGroup>
      {/* An empty group is hidden (DESIGN.md 4.8): e.g. no regions when the platform has no products. */}
      {facets.platforms.length > 0 && (
        <FilterGroup title="Platform" selectedCount={params.platform?.length}>
          <CheckboxFilter
            label="Platform"
            options={facets.platforms}
            selected={params.platform ?? []}
            onChange={(selected) => onChange({ platform: selected })}
          />
        </FilterGroup>
      )}
      {facets.regions.length > 0 && (
        <FilterGroup title="Region" selectedCount={params.region?.length}>
          <CheckboxFilter
            label="Region"
            options={facets.regions}
            selected={params.region ?? []}
            onChange={(selected) => onChange({ region: selected })}
          />
        </FilterGroup>
      )}
    </>
  );
}
