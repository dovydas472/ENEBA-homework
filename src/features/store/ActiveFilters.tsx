import { X } from "lucide-react";
import type { Facets, FacetOption } from "../../api/types.ts";
import { Button } from "../../components/Button.tsx";
import { formatPrice } from "../../lib/formatPrice.ts";
import type { StoreParams } from "../../lib/storeParams.ts";
import styles from "./ActiveFilters.module.css";

interface ActiveFiltersProps {
  params: StoreParams;
  /** Used to turn a slug ("psn") into a name ("PlayStation Network"). May be missing while loading. */
  facets?: Facets;
  onChange: (patch: Partial<StoreParams>) => void;
  onClearAll: () => void;
}

interface Chip {
  key: string;
  /** What the chip says. */
  label: string;
  /** What a screen reader says for the remove button. */
  removeLabel: string;
  remove: () => void;
}

/** The slug's display name, or the slug itself when the facets do not know it (e.g. a hand-typed unknown slug). */
function nameOf(options: FacetOption[] | undefined, slug: string): string {
  return options?.find((option) => option.slug === slug)?.name ?? slug;
}

function priceLabel(minPrice?: number, maxPrice?: number): string {
  if (minPrice !== undefined && maxPrice !== undefined) return `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}`;
  if (minPrice !== undefined) return `From ${formatPrice(minPrice)}`;
  return `Up to ${formatPrice(maxPrice)}`;
}

/**
 * The chips above the results (owner decision S1): one per active filter, each with an × that removes just
 * that filter, plus "Clear all". Renders nothing when no filter is active.
 */
export function ActiveFilters({ params, facets, onChange, onClearAll }: ActiveFiltersProps) {
  const { platform = [], region = [], minPrice, maxPrice } = params;
  const chips: Chip[] = [];

  for (const slug of platform) {
    const name = nameOf(facets?.platforms, slug);
    chips.push({
      key: `platform:${slug}`,
      label: name,
      removeLabel: `Remove filter: platform ${name}`,
      remove: () => onChange({ platform: platform.filter((s) => s !== slug) }), // an empty list = no filter (buildProductsQuery skips it)
    });
  }
  for (const slug of region) {
    const name = nameOf(facets?.regions, slug);
    chips.push({
      key: `region:${slug}`,
      label: name,
      removeLabel: `Remove filter: region ${name}`,
      remove: () => onChange({ region: region.filter((s) => s !== slug) }),
    });
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    const label = priceLabel(minPrice, maxPrice);
    chips.push({
      key: "price",
      label,
      removeLabel: `Remove filter: price ${label}`,
      remove: () => onChange({ minPrice: undefined, maxPrice: undefined }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <ul className={styles.chips} aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button type="button" className={styles.chip} aria-label={chip.removeLabel} onClick={chip.remove}>
            {chip.label}
            <X className={styles.icon} aria-hidden="true" />
          </button>
        </li>
      ))}
      <li>
        <Button variant="ghost" onClick={onClearAll}>
          Clear all
        </Button>
      </li>
    </ul>
  );
}
