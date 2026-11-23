// The hero picture's responsive-image settings in ONE place (Task 17): the carousel's <picture> uses them, and so does
// the early preload. A preload is only reused when it asks for exactly the file the <img> will pick, so both must
// describe the picture the same way.
import { preload } from "react-dom";
import type { SlideImage } from "../../api/types.ts";

/** Phones get the phone crop of a slide (the <source> of the <picture>). Same width as the CSS breakpoint. */
export const HERO_PHONE_MEDIA = "(max-width: 600px)";
/** The phone crop is drawn across the whole screen. */
export const HERO_PHONE_SIZES = "100vw";
/**
 * How wide the desktop picture is drawn, so the browser can pick the smallest sharp file before the layout exists:
 * the full width up to 930 px; above it the carousel shares its row with the side tiles. Measured: at 1440 px it is
 * exactly 70vw (1008 px). The tiles are server content (they can be switched off), so no fixed calc() is right in
 * every case; 70vw picks the same file as the real width at every viewport checked (Task 17 report).
 */
export const HERO_SIZES = "(max-width: 930px) 100vw, 70vw";

/**
 * Starts downloading the first slide's picture - the biggest thing on the first screen (the page's LCP element) - as
 * soon as GET /api/homepage has named it, instead of after GET /api/blocks/hero answers. React's preload() adds a
 * <link rel="preload" as="image" imagesrcset=... fetchpriority="high"> to <head> (once per picture, however often it
 * is called). The crop is chosen with the same media query as the <picture>, so only ONE file is downloaded.
 */
export function preloadHeroImage(image: SlideImage): void {
  // matchMedia is missing in some test environments: then the desktop crop is assumed.
  const phone = typeof window.matchMedia === "function" && window.matchMedia(HERO_PHONE_MEDIA).matches;
  const href = phone ? image.mobileUrl : image.url;
  const srcset = (phone ? image.mobileSrcset : image.srcset) ?? undefined;
  preload(href, {
    as: "image",
    fetchPriority: "high",
    imageSrcSet: srcset,
    imageSizes: srcset ? (phone ? HERO_PHONE_SIZES : HERO_SIZES) : undefined,
  });
}
