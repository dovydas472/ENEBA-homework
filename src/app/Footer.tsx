import { APP_NAME, GITHUB_URL, IGDB_URL } from "../lib/appInfo.ts";
import { VisuallyHidden } from "../components/VisuallyHidden.tsx";
import styles from "./Footer.module.css";

/** An external link: opens in a new tab and tells screen-reader users so. */
function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
    </a>
  );
}

/** Credits and the non-affiliation note (DESIGN.md 3.5). The IGDB credit is a condition of using their data. */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p>
          Game data and cover art provided by <ExternalLink href={IGDB_URL}>IGDB</ExternalLink>.
        </p>
        <p>{APP_NAME} is an internship demo project and is not affiliated with Eneba.</p>
        <p>
          <ExternalLink href={GITHUB_URL}>Source code on GitHub</ExternalLink>
        </p>
      </div>
    </footer>
  );
}
