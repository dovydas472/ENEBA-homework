import { ShoppingCart, User } from "lucide-react";
import { useRef } from "react";
import { Link, useNavigate } from "react-router";
import { Badge } from "../components/Badge.tsx";
import { SearchField } from "../components/SearchField.tsx";
import { APP_NAME } from "../lib/appInfo.ts";
import { buildStoreSearch } from "../lib/storeParams.ts";
import { useCartCount } from "../lib/useCartCount.ts";
import { useSlashShortcut } from "../lib/useSlashShortcut.ts";
import { useStoreParams } from "../lib/useStoreParams.ts";
import styles from "./Header.module.css";

/**
 * Top bar (DESIGN.md 3.1): wordmark, search field, cart with count, Sign in.
 * On a phone (< 600 px) the search field moves to its own full-width row (see Header.module.css).
 */
export function Header() {
  const navigate = useNavigate();
  const searchInput = useRef<HTMLInputElement>(null);
  const cartCount = useCartCount();
  // On the Store page the field shows the current search text (the URL is the source of truth).
  const { params } = useStoreParams();

  useSlashShortcut(searchInput);

  function handleSearch(text: string) {
    const q = text.trim();
    if (!q) return; // an empty submit does nothing
    navigate({ pathname: "/store", search: buildStoreSearch({ q }) });
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.wordmark}>
          {APP_NAME}
        </Link>

        <div className={styles.search}>
          {/* `key` makes the (uncontrolled) field start over with the new text when ?q= changes. */}
          <SearchField
            key={params.q ?? ""}
            defaultValue={params.q}
            inputRef={searchInput}
            label="Search games"
            placeholder="Search games"
            onSearch={handleSearch}
          />
        </div>

        <nav className={styles.actions} aria-label="Cart and account">
          <Link
            to="/cart"
            className={styles.iconLink}
            aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
          >
            <ShoppingCart className={styles.icon} />
            <Badge variant="count" className={styles.count}>
              {cartCount}
            </Badge>
          </Link>
          {/* aria-label keeps the name on phones, where the text is hidden and only the icon shows. */}
          <Link to="/login" className={styles.iconLink} aria-label="Sign in">
            <User className={styles.icon} />
            <span className={styles.signInText}>Sign in</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
