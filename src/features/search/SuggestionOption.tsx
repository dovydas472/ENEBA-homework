import type { MouseEvent } from "react";
import { Link } from "react-router";
import type { Suggestion } from "../../api/types.ts";
import { Price } from "../../components/Price.tsx";
import { cx } from "../../lib/cx.ts";
import { CoverImage } from "../store/CoverImage.tsx";
import { highlightParts } from "./highlight.ts";
import styles from "./SuggestionOption.module.css";

interface SuggestionOptionProps {
  item: Suggestion;
  /** DOM id: the input points at the active row with aria-activedescendant. */
  id: string;
  /** The text typed in the field (for the highlight). */
  query: string;
  /** Moved to with ↓/↑: drawn like a hovered row and announced by screen readers. */
  active: boolean;
  onChoose: () => void;
  onPrefetch: () => void;
}

/** Keeps the focus in the text field when a row is clicked (the field must stay the focused element). */
function keepFocusInField(event: MouseEvent) {
  event.preventDefault();
}

/** The title (or alias) with the typed text drawn highlighted. */
function Highlighted({ text, query }: { text: string; query: string }) {
  return highlightParts(text, query).map((part, i) =>
    part.match ? (
      <mark key={i} className={styles.mark}>
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

/**
 * One game in the header search list (DESIGN.md 4.13), laid out like Eneba's rows: cover on the left, title and
 * details in the middle, price on the right.
 * It is a real link (so middle-click / "open in new tab" work) with role="option": inside the listbox it is an
 * option, and the keyboard never stops on it (tabIndex -1) - ↓/↑ in the field move between the rows instead.
 */
export function SuggestionOption({ item, id, query, active, onChoose, onPrefetch }: SuggestionOptionProps) {
  return (
    <Link
      to={`/product/${item.productSlug}`}
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      className={cx(styles.option, active && styles.active)}
      onMouseDown={keepFocusInField}
      onMouseEnter={onPrefetch}
      onClick={onChoose}
    >
      <div className={styles.cover}>
        <CoverImage url={item.coverUrl} title={item.gameTitle} />
      </div>
      <div className={styles.body}>
        <div className={styles.title}>
          <Highlighted text={item.gameTitle} query={query} />
        </div>
        {/* "Standard" is the normal edition: only a special edition is worth a line (same rule as the Store card). */}
        {item.edition !== "Standard" && <div className={styles.edition}>{item.edition}</div>}
        {/* Found through another name ("gta" -> Grand Theft Auto V): show which one, so the row makes sense. */}
        {item.matchedAlias && (
          <div className={styles.alias}>
            Also known as <Highlighted text={item.matchedAlias} query={query} />
          </div>
        )}
        <div className={styles.meta}>
          {item.platform.name} · {item.region.name}
        </div>
      </div>
      <div className={styles.price}>
        {item.inStock && item.priceCents !== null ? (
          <Price label="From" cents={item.priceCents} size="row" className={styles.priceBlock} />
        ) : (
          <p className={styles.outOfStock}>Out of stock</p>
        )}
      </div>
    </Link>
  );
}
