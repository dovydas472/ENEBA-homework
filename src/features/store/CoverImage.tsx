import { useState } from "react";
import styles from "./CoverImage.module.css";

interface CoverImageProps {
  /** Image address from the API; null = the game has no cover. */
  url: string | null;
  /** Used for the generated placeholder. */
  title: string;
}

/**
 * The cover of a product card. The box has a FIXED aspect ratio (CSS), so the card has its final height
 * before the image arrives: nothing jumps when covers load (no layout shift).
 * If there is no cover, or the image fails to load, a placeholder (title on a gradient) is shown instead of
 * the browser's broken-image icon. The image is decorative (alt=""): the card text already names the game.
 */
export function CoverImage({ url, title }: CoverImageProps) {
  // We remember WHICH address failed (not just "failed"), so a new url gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url !== null && url !== failedUrl;

  return (
    <div className={styles.cover}>
      {showImage ? (
        <img
          className={styles.image}
          src={url}
          alt=""
          loading="lazy" // covers below the fold are fetched only when the user scrolls near them
          decoding="async"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <div className={styles.placeholder} aria-hidden="true">
          <span className={styles.placeholderTitle}>{title}</span>
        </div>
      )}
    </div>
  );
}
