import { Link } from "react-router";
import { APP_NAME, GITHUB_URL, IGDB_URL } from "../lib/appInfo.ts";
import { VisuallyHidden } from "../components/VisuallyHidden.tsx";
import styles from "./Footer.module.css";
import { NAV_LINKS } from "./navLinks.ts";

/** An external link: opens in a new tab and tells screen-reader users so. */
function ExternalLink({ href, children, className }: { href: string; children: string; className?: string }) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
      <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
    </a>
  );
}

/**
 * Footer (DESIGN.md 3.5): link columns with a small bold heading, like eneba.com, and a legal line at the bottom.
 * Only our own content and links that work. The IGDB credit is a condition of using their data.
 */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.columns}>
          <section>
            <h2 className={styles.heading}>Shop</h2>
            <ul>
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className={styles.link}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className={styles.heading}>About</h2>
            <ul>
              <li>
                <ExternalLink href={GITHUB_URL} className={styles.link}>
                  Source code on GitHub
                </ExternalLink>
              </li>
            </ul>
            <p className={styles.text}>
              Game data and cover art provided by <ExternalLink href={IGDB_URL}>IGDB</ExternalLink>.
            </p>
          </section>
        </div>
        <p className={styles.legal}>{APP_NAME} is an internship demo project and is not affiliated with Eneba.</p>
      </div>
    </footer>
  );
}
