import { Menu, Search, ShoppingCart, User, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router";
import { Badge } from "../components/Badge.tsx";
import { SearchBox } from "../features/search/SearchBox.tsx";
import { APP_NAME } from "../lib/appInfo.ts";
import { cx } from "../lib/cx.ts";
import { useCartCount } from "../lib/useCartCount.ts";
import { useSlashShortcut } from "../lib/useSlashShortcut.ts";
import { useStoreParams } from "../lib/useStoreParams.ts";
import styles from "./Header.module.css";
import { MenuDrawer } from "./MenuDrawer.tsx";
import { NAV_LINKS } from "./navLinks.ts";

/**
 * Top of every page (DESIGN.md 3.1), laid out like eneba.com:
 *  - desktop (> 930 px): wordmark, search field, cart, Sign in; under it a full-width nav strip (Store + platforms);
 *  - phone / tablet (≤ 930 px): one 56 px row ☰ · wordmark · search icon · cart · account. The ☰ opens the menu
 *    with the nav links, the search icon opens the search field over the row.
 * The search field with its suggestions list is SearchBox (Task 13b).
 * Which parts show is decided by CSS (Header.module.css); React only keeps "is the menu / phone search open".
 */
export function Header() {
  const searchInput = useRef<HTMLInputElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const cartCount = useCartCount();
  // On the Store page the field shows the current search text (the URL is the source of truth); elsewhere it is empty.
  const { params } = useStoreParams();
  const { pathname } = useLocation();
  const urlQuery = pathname === "/store" ? params.q : undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useSlashShortcut(searchInput);

  // Phone: when the search row opens, the cursor goes straight into the field.
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    searchToggle.current?.focus(); // keyboard users continue where they were
  }

  // Esc reaches this only when the field has nothing left to close or clear (SearchBox stops it otherwise).
  function handleSearchKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && searchOpen) closeSearch();
  }

  return (
    <header className={styles.header}>
      <div className={cx(styles.inner, searchOpen && styles.searchOpen)}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label="Open menu"
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className={styles.icon} aria-hidden="true" />
        </button>

        <Link to="/" className={styles.wordmark}>
          {APP_NAME}
        </Link>

        <div className={styles.search} onKeyDown={handleSearchKeyDown}>
          <SearchBox
            urlQuery={urlQuery}
            inputRef={searchInput}
            label="Search games"
            placeholder="Search games"
            onDone={() => setSearchOpen(false)}
          />
          {/* Phone only: closes the search row again. */}
          <button type="button" className={styles.searchClose} aria-label="Close search" onClick={closeSearch}>
            <X className={styles.icon} aria-hidden="true" />
          </button>
        </div>

        <nav className={styles.actions} aria-label="Cart and account">
          {/* Phone only: opens the search row. */}
          <button
            ref={searchToggle}
            type="button"
            className={cx(styles.iconLink, styles.searchToggle)}
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(true)}
          >
            <Search className={styles.icon} aria-hidden="true" />
          </button>
          <Link
            to="/cart"
            className={styles.iconLink}
            aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
          >
            <ShoppingCart className={styles.icon} aria-hidden="true" />
            {/* Like Eneba: no badge for an empty cart (the link's name still says "0 items"). */}
            {cartCount > 0 && (
              <Badge variant="count" className={styles.count}>
                {cartCount}
              </Badge>
            )}
          </Link>
          {/* aria-label keeps the name on phones, where the text is hidden and only the icon shows. */}
          <Link to="/login" className={styles.iconLink} aria-label="Sign in">
            <User className={styles.icon} aria-hidden="true" />
            <span className={styles.signInText}>Sign in</span>
          </Link>
        </nav>
      </div>

      {/* Desktop nav strip. On phones the same links are in the ☰ menu. */}
      <nav className={styles.nav} aria-label="Main">
        <ul className={styles.navList}>
          {NAV_LINKS.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className={styles.navLink}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
