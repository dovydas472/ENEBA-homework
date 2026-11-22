// Open-redirect protection for the `next` parameter of /login and /register (Task 14, A8).
//
// /login?next=/orders sends the user back to /orders after signing in. Without a check, an attacker could send
// a link like /login?next=https://evil.example (or //evil.example): the user signs in on OUR real page and is
// then quietly forwarded to a fake copy that asks for the password again. So only paths on this same site
// are accepted; anything else goes to "/".

/** The pages that must never be the target (signing in and being sent back to the sign-in page is a loop). */
const AUTH_PAGES = new Set(["/login", "/register"]);

/**
 * Returns `raw` if it is a safe same-site path, otherwise "/".
 * Safe = starts with exactly one "/" (not "//", which browsers read as "another host"), contains no "\"
 * (browsers turn "/\evil.example" into "//evil.example"), no control characters, and - as a final check -
 * resolves to this same origin.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  // eslint-disable-next-line no-control-regex -- control characters (tab, newline...) are exactly what we reject
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return "/";

  const base = "https://same-site.invalid";
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return "/";
  }
  if (url.origin !== base || AUTH_PAGES.has(url.pathname)) return "/";
  return url.pathname + url.search + url.hash;
}

/** "/login" or "/register" with ?next=… for the given target (left out when the target is just "/"). */
export function authPageLink(page: "/login" | "/register", next: string): string {
  const safe = safeNextPath(next);
  return safe === "/" ? page : `${page}?next=${encodeURIComponent(safe)}`;
}
