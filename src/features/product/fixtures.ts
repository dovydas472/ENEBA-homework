// Test data for the product page (used only by *.test.tsx files). Numbers follow the seeded Witcher 3
// (Task 08 report): offers 10.99 / 12.99 / 18.99 (new seller) / 25.99, MSRP 39.99.
import type { Offer, ProductDetail, Seller } from "../../api/types.ts";

function seller(overrides: Partial<Seller>): Seller {
  return { slug: "s", name: "S", rating: null, ratingLabel: null, isNew: false, reviewsCount: 0, ...overrides };
}

export const offers: Offer[] = [
  { offerId: 15, priceCents: 1099, stock: 6, seller: seller({ slug: "retro-ridge", name: "Retro Ridge", rating: 7.38, reviewsCount: 412 }) },
  {
    offerId: 16,
    priceCents: 1299,
    stock: 3,
    seller: seller({ slug: "quest-depot", name: "Quest Depot", rating: 8.46, ratingLabel: "Good", reviewsCount: 1204 }),
  },
  { offerId: 17, priceCents: 1899, stock: 4, seller: seller({ slug: "fresh-start-keys", name: "Fresh Start Keys", isNew: true }) },
  {
    offerId: 18,
    priceCents: 2599,
    stock: 2,
    seller: seller({ slug: "keystone-kiosk", name: "Keystone Kiosk", rating: 9.63, ratingLabel: "Excellent", reviewsCount: 9875 }),
  },
];

export function makeDetail(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    product: {
      slug: "the-witcher-3-wild-hunt-steam-global",
      edition: "Standard",
      platform: { slug: "steam", name: "Steam" },
      region: { slug: "global", name: "GLOBAL" },
      msrpCents: 3999,
      priceCents: 1099,
      inStock: true,
    },
    game: {
      title: "The Witcher 3: Wild Hunt",
      description: "Geralt of Rivia hunts monsters.\nA second paragraph.",
      genres: ["Role-playing (RPG)", "Adventure"],
      releaseDate: "2015-05-19",
      developer: "CD Projekt RED",
      publisher: null,
      coverUrl: "https://images.example/witcher.jpg",
    },
    offers,
    variants: [
      {
        slug: "the-witcher-3-wild-hunt-game-of-the-year-edition-steam-global",
        edition: "Game of the Year Edition",
        platform: { slug: "steam", name: "Steam" },
        region: { slug: "global", name: "GLOBAL" },
        priceCents: 2999,
        inStock: true,
      },
      {
        slug: "the-witcher-3-wild-hunt-psn-europe",
        edition: "Standard",
        platform: { slug: "psn", name: "PSN" },
        region: { slug: "europe", name: "EUROPE" },
        priceCents: null,
        inStock: false,
      },
    ],
    ...overrides,
  };
}

/** The same game, out of stock: no offers, no price. */
export function makeOutOfStockDetail(): ProductDetail {
  const detail = makeDetail({ offers: [] });
  return { ...detail, product: { ...detail.product, priceCents: null, inStock: false } };
}
