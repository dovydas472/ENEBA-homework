// Test data for the home page (used only by *.test.tsx files). The shapes match pkg/homepage/types.go.
import type {
  HeroBlockData,
  HeroSlide,
  HomepageResponse,
  PlatformsBlockData,
  ProductRowBlockData,
  TilesBlockData,
} from "../../api/types.ts";
import { makeItem } from "../store/fixtures.ts";

export const registry: HomepageResponse = {
  blocks: [
    { key: "hero", type: "hero", title: "Featured", endpoint: "/api/blocks/hero" },
    { key: "tiles", type: "tiles", title: "Shortcuts", endpoint: "/api/blocks/tiles" },
    { key: "platforms", type: "platforms", title: "Browse by platform", endpoint: "/api/blocks/platforms" },
    { key: "discounts", type: "product_row", title: "Biggest discounts", endpoint: "/api/blocks/products/discounts" },
  ],
};

export function makeSlide(overrides: Partial<HeroSlide> = {}): HeroSlide {
  return {
    id: 1,
    title: "INNERT",
    subtitle: "Realms · Raids · Dragons",
    badge: "Coming soon",
    image: {
      url: "/banners/innert-hero-1920.webp",
      srcset: "/banners/innert-hero-1280.webp 1280w, /banners/innert-hero-1920.webp 1920w",
      mobileUrl: "/banners/innert-mobile-1080.webp",
      mobileSrcset: "/banners/innert-mobile-768.webp 768w, /banners/innert-mobile-1080.webp 1080w",
    },
    cta: null,
    priceCents: null,
    ...overrides,
  };
}

export const hero: HeroBlockData = {
  slides: [
    makeSlide(),
    makeSlide({
      id: 2,
      title: "Grand Theft Auto V",
      subtitle: "Steam key · Global",
      badge: null,
      cta: { label: "Buy now", href: "/product/grand-theft-auto-v-steam-global" },
      priceCents: 1199,
    }),
    makeSlide({
      id: 3,
      title: "The Witcher 3: Wild Hunt",
      subtitle: null,
      badge: null,
      cta: { label: "Buy now", href: "/product/the-witcher-3-wild-hunt-steam-global" },
      priceCents: 1099,
    }),
  ],
};

export const tiles: TilesBlockData = {
  tiles: [
    { id: 1, title: "Up to −70%", subtitle: "The biggest discounts", href: "/store?sort=discount", accent: "promo", coverUrls: ["https://img/a.jpg", "https://img/b.jpg"] },
    { id: 2, title: "Steam games", subtitle: null, href: "/store?platform=steam", accent: "violet", coverUrls: [] },
    { id: 3, title: "New releases", subtitle: "The latest games", href: "/store?sort=newest", accent: "a-new-accent", coverUrls: [] },
  ],
};

export const platforms: PlatformsBlockData = {
  items: [
    { key: "all", label: "All games", count: 108, href: "/store", icon: "layout-grid" },
    { key: "steam", label: "Steam", count: 54, href: "/store?platform=steam", icon: "monitor" },
    { key: "epic-games", label: "Epic Games", count: 1, href: "/store?platform=epic-games", icon: "an-icon-we-do-not-have" },
  ],
};

export const discounts: ProductRowBlockData = {
  items: [
    makeItem({ slug: "god-of-war-steam-global", title: "God of War" }),
    makeItem({ slug: "tomb-raider-steam-global", title: "Tomb Raider" }),
  ],
  viewAllHref: "/store?sort=discount",
};

/** The default answer of every home page endpoint. */
export const homeResponses: Record<string, unknown> = {
  "/api/homepage": registry,
  "/api/blocks/hero": hero,
  "/api/blocks/tiles": tiles,
  "/api/blocks/platforms": platforms,
  "/api/blocks/products/discounts": discounts,
};
