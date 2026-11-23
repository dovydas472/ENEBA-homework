-- +goose Up
-- Task 15 review: the discount tile shows the LIVE biggest discount instead of a fixed "−70%".
-- {maxDiscount} in a tile title is replaced by the API (pkg/homepage, MaxDiscountToken) with the
-- biggest discount of the products that can be bought now, e.g. "Up to −73%".
-- A new migration instead of editing 00006: 00006 may already be applied (dev, and production if
-- the pre-merge run happened), and an applied migration is never edited.
-- Backward compatible: the code deployed on main does not read the home page tables yet.
UPDATE homepage_tiles SET title = 'Up to −{maxDiscount}%' WHERE title = 'Up to −70%';

-- +goose Down
UPDATE homepage_tiles SET title = 'Up to −70%' WHERE title = 'Up to −{maxDiscount}%';
