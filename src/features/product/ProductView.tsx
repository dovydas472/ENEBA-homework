import { Globe, KeyRound, MonitorPlay } from "lucide-react";
import type { ReactElement } from "react";
import type { ProductDetail } from "../../api/types.ts";
import { Badge } from "../../components/Badge.tsx";
import { Breadcrumb } from "../../components/Breadcrumb.tsx";
import { Skeleton } from "../../components/Skeleton.tsx";
import { cx } from "../../lib/cx.ts";
import { useInView } from "../../lib/useInView.ts";
import { CoverImage } from "../store/CoverImage.tsx";
import { BuyBox, OutOfStockBox } from "./BuyBox.tsx";
import { OfferList } from "./OfferList.tsx";
import { ProductDetails } from "./ProductDetails.tsx";
import styles from "./ProductView.module.css";
import { StickyBuyBar } from "./StickyBuyBar.tsx";
import { VariantList } from "./VariantList.tsx";

/**
 * The product page once its data is loaded, laid out like eneba.com (measured in Task 12):
 *  - desktop: breadcrumb; cover (224px) + title + facts; the buy box in a 350px column on the right;
 *    under them the offers, other versions and the details.
 *  - ≤ 930px: one column - small cover next to the title, the buy box edge to edge, then the rest.
 *  - ≤ 600px: + the sticky "Add to cart" bar at the bottom (P5).
 * The order on screen comes from CSS grid areas (ProductView.module.css), so the HTML order stays logical.
 */
export function ProductView({ detail }: { detail: ProductDetail }) {
  const { product, game } = detail;
  const buyable = detail.offers.length > 0;
  // The phone bar shows only while the buy box's own button is off screen.
  const { ref: buyButtonRef, inView: buyButtonVisible } = useInView<HTMLButtonElement>();

  return (
    // data-wide-page: the layout widens <main> to 1440px for this page (Layout.module.css).
    <div className={cx(styles.page, buyable && styles.withBottomBar)} data-wide-page="">
      <div className={styles.breadcrumb}>
        <Breadcrumb items={[{ label: "Store", to: "/store" }, { label: game.title }]} />
      </div>

      <div className={styles.cover}>
        <CoverImage url={game.coverUrl} title={game.title} />
      </div>

      <div className={styles.head}>
        {/* Eneba puts a pill ("Cashback deal") above the title; ours says the edition, when it is a special one. */}
        {product.edition !== "Standard" && (
          <Badge variant="tag" className={styles.edition}>
            {product.edition}
          </Badge>
        )}
        <h1 className={styles.title}>{game.title}</h1>
      </div>

      <ul className={styles.facts}>
        <Fact icon={<Globe />} title={product.region.name} text="Region of the key" />
        <Fact icon={<MonitorPlay />} title={product.platform.name} text={`Activate / redeem on ${product.platform.name}`} />
        <Fact icon={<KeyRound />} title="Digital key" text="A product key, not a box. In this demo every key is fake." />
      </ul>

      <div className={styles.aside}>
        {buyable ? <BuyBox detail={detail} buttonRef={buyButtonRef} /> : <OutOfStockBox detail={detail} />}
      </div>

      <div className={styles.main}>
        {buyable && <OfferList detail={detail} />}
        <VariantList variants={detail.variants} />
        <ProductDetails detail={detail} />
      </div>

      {buyable && <StickyBuyBar detail={detail} hidden={buyButtonVisible} />}
    </div>
  );
}

/** One of the facts next to the cover (Eneba: icon, 16px bold heading, 12px helper text). */
function Fact({ icon, title, text }: { icon: ReactElement; title: string; text: string }) {
  return (
    <li className={styles.fact}>
      <span className={styles.factIcon} aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong className={styles.factTitle}>{title}</strong>
        <span className={styles.factText}>{text}</span>
      </span>
    </li>
  );
}

/** Shown while the product loads (usually never: the hover prefetch fills the cache). Same grid as the page. */
export function ProductViewSkeleton() {
  return (
    <div className={styles.page} data-wide-page="" aria-busy="true">
      <div className={styles.cover}>
        <Skeleton variant="block" className={styles.skeletonCover} />
      </div>
      <div className={styles.head}>
        <Skeleton className={styles.skeletonTitle} />
      </div>
      <div className={styles.facts}>
        <Skeleton className={styles.skeletonLine} />
        <Skeleton className={styles.skeletonLine} />
      </div>
      <div className={styles.aside}>
        <div className={styles.skeletonBox}>
          <Skeleton className={styles.skeletonLine} />
          <Skeleton className={styles.skeletonPrice} />
          <Skeleton className={styles.skeletonButton} />
        </div>
      </div>
      <div className={styles.main}>
        {[1, 2, 3].map((row) => (
          <div key={row} className={styles.skeletonRow}>
            <Skeleton className={styles.skeletonAvatarLine} />
          </div>
        ))}
      </div>
    </div>
  );
}
