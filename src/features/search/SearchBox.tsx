import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { useNavigate } from "react-router";
import { PrefetchLink } from "../../components/PrefetchLink.tsx";
import { suggestionsQuery } from "../../api/queries.ts";
import { prefetchRoute } from "../../app/prefetch.ts";
import { Spinner } from "../../components/Spinner.tsx";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import { cx } from "../../lib/cx.ts";
import { buildStoreSearch, cleanQuery, MAX_QUERY_LENGTH } from "../../lib/storeParams.ts";
import { useDebouncedValue } from "../../lib/useDebouncedValue.ts";
import { moveActive } from "./moveActive.ts";
import styles from "./SearchBox.module.css";
import { SuggestionOption } from "./SuggestionOption.tsx";

/** How long typing must pause before the suggestions are requested (owner decision Q2: ~200 ms). */
export const SUGGEST_DEBOUNCE_MS = 200;

interface SearchBoxProps {
  /** The search text of the current Store URL (`/store?q=…`); undefined on other pages. The field shows it. */
  urlQuery?: string;
  /** Accessible name of the field (there is no visible label). */
  label: string;
  placeholder?: string;
  /** Lets the parent focus the input (the "/" shortcut, the phone search icon). */
  inputRef?: Ref<HTMLInputElement>;
  /** Called after the user searched or opened a product (the phone search row closes then). */
  onDone?: () => void;
}

/**
 * The header search with suggestions (DESIGN.md 3.1, 4.13): an ARIA 1.2 combobox with a listbox popup.
 *
 * - The focus always stays in the text field. ↓/↑ only change which row is "active"; the field tells screen readers
 *   which one through aria-activedescendant (the id of that row). That is why the rows are not in the Tab order.
 * - From 2 characters, ~200 ms after the last key (useDebouncedValue), TanStack Query asks for suggestions.
 *   keepPreviousData keeps the old rows on screen while the new ones load (no flicker). Every text has its own
 *   cache key, so an old, slow answer can never replace the rows of the newer text.
 * - Enter on a row opens that product; Enter with no active row (or "See all results") goes to /store?q=….
 *   Esc closes the list, a second Esc clears the field. Tab and a click outside close the list.
 */
export function SearchBox({ urlQuery, label, placeholder, inputRef, onDone }: SearchBoxProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = useId();
  const listboxId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const fieldRef = useRef<HTMLFormElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const [text, setText] = useState(urlQuery ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // When the URL's search text changes (a search was made, Back/Forward, another page), the field shows it.
  // This is React's "adjust state when a prop changes" pattern: compare with the previous value during render,
  // instead of an effect (an effect would first paint the old text, then the new one).
  const [shownUrlQuery, setShownUrlQuery] = useState(urlQuery);
  if (urlQuery !== shownUrlQuery) {
    setShownUrlQuery(urlQuery);
    setText(urlQuery ?? "");
    setOpen(false);
  }

  const query = cleanQuery(text); // undefined while shorter than 2 characters
  const debouncedQuery = useDebouncedValue(query, SUGGEST_DEBOUNCE_MS);
  const suggestions = useQuery({
    ...suggestionsQuery(debouncedQuery ?? ""),
    // Only while the list is wanted: a Store page opened with ?q= must not ask for suggestions by itself.
    enabled: open && debouncedQuery !== undefined,
    placeholderData: keepPreviousData,
  });

  const items = suggestions.data?.items ?? [];
  // Rows of the list: the games, then "See all results". An empty answer has no rows at all.
  const optionCount = items.length > 0 ? items.length + 1 : 0;
  const seeAllIndex = items.length;
  // "No matches" only for a REAL answer for this text (not for the previous text's empty list kept while loading).
  const noMatches = items.length === 0 && suggestions.isSuccess && !suggestions.isPlaceholderData;
  const popupVisible = open && query !== undefined && (optionCount > 0 || noMatches);
  const expanded = popupVisible && optionCount > 0;
  // A new answer can be shorter than the old one: an index past its end means "nothing active".
  const active = expanded && activeIndex < optionCount ? activeIndex : -1;

  // Click outside (anywhere but the field and the list) closes the list. Only listening while it is open.
  useEffect(() => {
    if (!popupVisible) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (fieldRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [popupVisible]);

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  /**
   * ↓/↑ onto a game row requests its product page data before Enter (the same prefetchRoute as every PrefetchLink),
   * so the product page usually opens at once. A hovered row is a PrefetchLink and does this by itself.
   */
  function prefetch(index: number) {
    const item = items[index];
    if (item) prefetchRoute(queryClient, `/product/${item.productSlug}`);
  }

  /** Enter with no active row, the magnifier button and "See all results": the Store page with this search. */
  function submitSearch() {
    if (query === undefined) return; // fewer than 2 characters: nothing to search for
    close();
    navigate({ pathname: "/store", search: buildStoreSearch({ q: query }) });
    onDone?.();
  }

  /** A game row was chosen (Enter or click): the field empties, because it only shows the Store page's search. */
  function afterProductChosen() {
    close();
    setText("");
    onDone?.();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); // no page reload: the router navigates
    submitSearch();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setText(event.target.value);
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault(); // otherwise the text cursor jumps to the start / end
        if (!expanded) {
          setOpen(true); // the first ↓ only opens the list
          return;
        }
        const next = moveActive(active, optionCount, event.key === "ArrowDown" ? "down" : "up");
        setActiveIndex(next);
        prefetch(next);
        return;
      }
      case "Enter": {
        if (active === -1) return; // the form submits: search for the text
        event.preventDefault();
        if (active === seeAllIndex) {
          submitSearch();
        } else {
          navigate(`/product/${items[active].productSlug}`);
          afterProductChosen();
        }
        return;
      }
      case "Escape": {
        // preventDefault also stops the browser's own "Esc clears a search field", so the two steps stay ours.
        // stopPropagation: the phone search row closes on Esc only when there is nothing left for the field to do.
        if (popupVisible) {
          close();
        } else if (text !== "") {
          setText("");
        } else {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      case "Tab":
        close(); // the focus leaves; the list must not stay open behind it
        return;
    }
  }

  // Read by screen readers when it changes (the list itself is not read while the focus is in the field).
  let status = "";
  if (expanded) status = `${items.length} ${items.length === 1 ? "game" : "games"} found. Use the up and down arrows to choose.`;
  else if (popupVisible) status = `No matches for '${debouncedQuery}'`;

  return (
    <div className={cx(styles.box, popupVisible && styles.boxOpen)}>
      <form ref={fieldRef} className={styles.field} role="search" onSubmit={handleSubmit}>
        <button type="submit" className={styles.submit} aria-label={label}>
          <Search className={styles.icon} />
        </button>
        <input
          ref={inputRef}
          className={styles.input}
          type="search"
          name="q"
          value={text}
          placeholder={placeholder}
          aria-label={label}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={MAX_QUERY_LENGTH}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={() => setOpen(true)}
        />
        {/* Subtle "loading" sign while suggestions are on the way; the old rows stay meanwhile. */}
        {open && query !== undefined && suggestions.isFetching && (
          <span className={styles.loading}>
            <Spinner />
          </span>
        )}
      </form>

      {/* Dims the page behind the list, as on Eneba. A click on it is a click outside: the list closes. */}
      {popupVisible && <div className={styles.backdrop} aria-hidden="true" />}

      <div ref={popupRef} className={styles.popup} hidden={!popupVisible}>
        {/* The listbox is always in the page (aria-controls must point at something), hidden while closed. */}
        <div role="listbox" id={listboxId} aria-label="Search suggestions" hidden={!expanded} className={styles.listbox}>
          {items.map((item, index) => (
            <SuggestionOption
              key={item.productSlug}
              id={optionId(index)}
              item={item}
              query={text}
              active={index === active}
              onChoose={afterProductChosen}
            />
          ))}
          {items.length > 0 && query !== undefined && (
            <PrefetchLink
              to={{ pathname: "/store", search: buildStoreSearch({ q: query }) }}
              id={optionId(seeAllIndex)}
              role="option"
              aria-selected={active === seeAllIndex}
              tabIndex={-1}
              className={cx(styles.seeAll, active === seeAllIndex && styles.seeAllActive)}
              onMouseDown={(event) => event.preventDefault()} // keep the focus in the field
              onClick={() => {
                close();
                onDone?.();
              }}
            >
              See all results for '{query}'
            </PrefetchLink>
          )}
        </div>
        {noMatches && <p className={styles.noMatches}>No matches for '{debouncedQuery}'</p>}
      </div>

      <div role="status" aria-live="polite">
        <VisuallyHidden>{status}</VisuallyHidden>
      </div>
    </div>
  );
}
