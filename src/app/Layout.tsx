import { Outlet, ScrollRestoration } from "react-router";
import { DemoBanner } from "./DemoBanner.tsx";
import { Footer } from "./Footer.tsx";
import { Header } from "./Header.tsx";
import styles from "./Layout.module.css";
import { SlowServerNotice } from "./SlowServerNotice.tsx";
import { Toaster } from "./Toaster.tsx";

/**
 * The frame around every page. It is a "layout route": routes.ts nests all pages inside it, and
 * React Router puts the page of the current URL where <Outlet /> is. So the banner, header and footer
 * stay mounted while the pages change (the search text and focus are not lost on navigation).
 */
export function Layout() {
  return (
    <div className={styles.layout}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <DemoBanner />
      <Header />
      <main id="main" tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <Footer />
      {/* Bottom corner: the toast ("Added to cart") and the "waking up" notice, stacked so they never overlap. */}
      <div className={styles.notices}>
        <Toaster />
        <SlowServerNotice />
      </div>
      {/* Remembers the scroll position of every history entry: Back from a product returns to the same place in
          the Store. A new page opens at the top (filter changes opt out, see useStoreParams). */}
      <ScrollRestoration />
    </div>
  );
}
