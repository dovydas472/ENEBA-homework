Change to Task 09 (owner decision): facet counts must follow the current filters.
- Remove the separate GET /api/catalog/facets endpoint. GET /api/products returns `facets` in the same response: { items, total, page, pageSize, facets }.
- facets.platforms / facets.regions: counts computed with ALL other active filters applied EXCEPT the facet's own (standard multi-select faceting), so other options in the same group keep their counts. Show entries with count > 0, plus any currently selected entry even if its count is 0. Order by sort_order.
- facets.priceRange {minCents, maxCents}: over in-stock products matching the platform/region filters (ignoring the price filter itself).
- The future search `q` must be applied to facets too – structure the SQL so adding it later is one condition.
- Integration tests: with platform=steam, region counts change but platform counts for psn etc. stay > 0; a selected platform with 0 results is still listed.
- Update DATA_MODEL.md (facet query), types.ts, README and PAAISKINIMAI_LT.md accordingly.
