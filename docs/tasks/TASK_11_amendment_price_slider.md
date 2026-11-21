# Task 11 – Amendment: price range slider (replaces S4)

Change to S4 (owner decision): price filter = dual-thumb range slider + the two € inputs, kept in sync.
- No new dependency: build it from two native <input type="range"> elements overlaid on one track (min thumb and max thumb), so keyboard and screen readers work out of the box (each thumb has its own label, e.g. "Minimum price" / "Maximum price", and aria-valuetext in €).
- Range = facets.priceRange (min/max in cents), step €0.50. Thumbs cannot cross.
- Dragging updates the inputs live, but the URL/query updates only on release (pointerup / keyup / change), not on every pixel.
- Typing in an input moves the thumb; applies on Enter/blur as before. min > max → inline message, no request.
- When priceRange is null (no in-stock results), disable the slider.
- Tests: value ↔ cents conversion, thumbs cannot cross, release triggers one URL update.
- Mobile: thumbs ≥ 40 px touch targets (DESIGN.md).
