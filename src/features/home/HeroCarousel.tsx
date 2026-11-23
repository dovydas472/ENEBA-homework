import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { homeBlockQuery, queryKeys } from "../../api/queries.ts";
import type { HeroBlockData, HeroSlide, HomepageResponse, SlideImage } from "../../api/types.ts";
import { ButtonLink } from "../../components/Button.tsx";
import { Price } from "../../components/Price.tsx";
import { Skeleton } from "../../components/Skeleton.tsx";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import { cx } from "../../lib/cx.ts";
import type { BlockProps } from "./blockTypes.ts";
import { BlockError } from "./BlockError.tsx";
import styles from "./HeroCarousel.module.css";
import { HERO_PHONE_MEDIA, HERO_PHONE_SIZES, HERO_SIZES } from "./heroImage.ts";
import { useCarousel } from "./useCarousel.ts";

/**
 * Hero block (H1): the big carousel at the top of the home page. Its slides come from GET /api/blocks/hero;
 * a product slide has the live price and a "Buy now" button to its product page.
 * While loading, the placeholder has exactly the carousel's size, so nothing moves when the slides arrive (CLS).
 */
export function HeroCarousel({ block }: BlockProps) {
  const query = useQuery(homeBlockQuery<HeroBlockData>(block.endpoint));
  // Task 17 (LCP): the registry (already in the cache - this block exists because the registry listed it) names the
  // first slide's picture, and HomePage has started downloading it. While the slides load, that picture is shown in
  // the placeholder: the biggest thing on the screen appears as soon as it is downloaded, not after this block's
  // request. Read from the cache, not with useQuery: this must never send a request of its own.
  const queryClient = useQueryClient();
  const firstImage = queryClient.getQueryData<HomepageResponse>(queryKeys.homepage)?.preload?.heroImage;

  if (query.isPending) {
    return (
      <div className={styles.carousel} aria-hidden="true">
        {firstImage ? <HeroPicture image={firstImage} first /> : <Skeleton variant="block" className={styles.skeleton} />}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className={cx(styles.carousel, styles.errorFrame)}>
        <BlockError title={block.title} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </div>
    );
  }
  if (query.data.slides.length === 0) return null; // nothing to show: the block takes no space
  return <Carousel label={block.title} slides={query.data.slides} />;
}

/**
 * The carousel itself (WAI-ARIA Authoring Practices "carousel" pattern):
 *  - a region named by the block title, announced as "carousel"; each slide is a group "2 of 3";
 *  - the Play / Pause button comes first in the Tab order, then Previous / Next, the slides, and the dots;
 *  - hidden slides are `inert` (their buttons cannot be reached with Tab) and hidden from screen readers;
 *  - while the slides move by themselves the live region is off (no announcement every 6 s); when they stand
 *    still, a change made by the user is announced ("polite").
 */
function Carousel({ label, slides }: { label: string; slides: HeroSlide[] }) {
  const carousel = useCarousel(slides.length);
  const many = slides.length > 1;

  return (
    <section className={styles.carousel} aria-roledescription="carousel" aria-label={label} {...carousel.rootProps}>
      {many && (
        <div className={styles.controls}>
          <button
            type="button"
            className={cx(styles.control, styles.rotation)}
            onClick={carousel.togglePlaying}
            aria-label={carousel.playing ? "Stop automatic slide show" : "Start automatic slide show"}
          >
            {carousel.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <button type="button" className={cx(styles.control, styles.arrow, styles.prev)} onClick={carousel.prev} aria-label="Previous slide">
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className={cx(styles.control, styles.arrow, styles.next)} onClick={carousel.next} aria-label="Next slide">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      )}

      <div className={styles.slides} aria-live={carousel.rotating ? "off" : "polite"}>
        {slides.map((slide, i) => (
          <Slide key={slide.id} slide={slide} position={i + 1} total={slides.length} active={i === carousel.index} first={i === 0} />
        ))}
      </div>

      {many && (
        <div className={styles.dots}>
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              className={styles.dot}
              onClick={() => carousel.goTo(i)}
              aria-label={`Slide ${i + 1}: ${slide.title}`}
              aria-current={i === carousel.index ? "true" : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface SlideProps {
  slide: HeroSlide;
  position: number;
  total: number;
  active: boolean;
  /** The first slide's picture is the page's LCP element: it loads at once and with high priority. */
  first: boolean;
}

function Slide({ slide, position, total, active, first }: SlideProps) {
  return (
    <div
      className={cx(styles.slide, active && styles.active)}
      role="group"
      aria-roledescription="slide"
      aria-label={`${position} of ${total}`}
      aria-hidden={!active}
      inert={!active}
    >
      <HeroPicture image={slide.image} first={first} />
      <div className={styles.content}>
        {slide.badge && <span className={styles.badge}>{slide.badge}</span>}
        <h2 className={styles.title}>{slide.title}</h2>
        {slide.subtitle && <p className={styles.subtitle}>{slide.subtitle}</p>}
        {(slide.priceCents !== null || slide.cta) && (
          <div className={styles.actions}>
            {slide.priceCents !== null && <Price label="From" cents={slide.priceCents} size="row" />}
            {slide.cta && (
              <ButtonLink to={slide.cta.href} className={styles.cta}>
                {slide.cta.label}
                {/* "Buy now: Grand Theft Auto V" - the visible words first (WCAG 2.5.3), then which product. */}
                <VisuallyHidden>: {slide.title}</VisuallyHidden>
              </ButtonLink>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A slide's picture. <picture>: phones get the phone crop; srcset + sizes let the browser pick the smallest file that
 * is sharp enough (the values are shared with the early preload, heroImage.ts, so the preloaded file is reused).
 * alt="" because the picture is decoration: the slide's text says what it is.
 * `first`: the first slide's picture is the page's LCP element - it loads at once and with high priority.
 */
function HeroPicture({ image, first }: { image: SlideImage; first: boolean }) {
  return (
    <picture className={styles.picture}>
      <source media={HERO_PHONE_MEDIA} srcSet={image.mobileSrcset ?? image.mobileUrl} sizes={HERO_PHONE_SIZES} />
      <img
        className={styles.image}
        src={image.url}
        srcSet={image.srcset ?? undefined}
        sizes={HERO_SIZES}
        alt=""
        loading={first ? "eager" : "lazy"}
        fetchPriority={first ? "high" : "auto"}
        decoding={first ? "auto" : "async"}
      />
    </picture>
  );
}
