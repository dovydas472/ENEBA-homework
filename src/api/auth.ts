// Typed functions for the auth endpoints (Task 14). Every call goes through apiFetch.
// The session itself is an HttpOnly cookie: JavaScript never sees the token, the browser sends it
// with every same-site request on its own. That is why nothing here stores or reads a token.
import { ApiError, apiFetch, type ApiOptions } from "./client.ts";

/** The signed-in account, exactly as the API returns it (never a password or hash). */
export interface User {
  id: number;
  email: string;
  /** A temporary demo account ("Sign in as demo user"): shown as "Demo user". */
  isDemo: boolean;
}

/** Body of every auth endpoint that returns the user. */
export interface UserResponse {
  user: User;
}

export interface Credentials {
  email: string;
  password: string;
}

/** POST with a JSON body. The browser adds the Origin header itself; the server checks it (CSRF). */
function postJSON<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * GET /api/auth/me: the signed-in user, or `null` when nobody is signed in.
 * 401 is the normal "signed out" answer, so it becomes `null`, not an error.
 * Anything else (network, 5xx) is still thrown: "we do not know" is not the same as "signed out".
 */
export async function getCurrentUser(options?: ApiOptions): Promise<User | null> {
  try {
    const res = await apiFetch<UserResponse>("/api/auth/me", options);
    return res.user;
  } catch (err) {
    if (err instanceof ApiError && err.code === "http" && err.status === 401) return null;
    throw err;
  }
}

/** POST /api/auth/login → the user (cookie set). 401 = wrong email or password, 429 = too many failures. */
export async function login(credentials: Credentials): Promise<User> {
  return (await postJSON<UserResponse>("/api/auth/login", credentials)).user;
}

/** POST /api/auth/register → the new user, already signed in. 400 = invalid input, 409 = email taken. */
export async function register(credentials: Credentials): Promise<User> {
  return (await postJSON<UserResponse>("/api/auth/register", credentials)).user;
}

/** POST /api/auth/demo → a brand-new temporary demo user, signed in. */
export async function signInAsDemo(): Promise<User> {
  return (await postJSON<UserResponse>("/api/auth/demo")).user;
}

/** POST /api/auth/logout → 204. The server deletes the session and clears the cookie. */
export async function logout(): Promise<void> {
  await postJSON<void>("/api/auth/logout");
}

/** Status codes whose `{"error": "..."}` text is written for the user and safe to show as is. */
const USER_FACING_STATUSES = new Set([400, 401, 409, 429]);

/**
 * The message to show for a failed auth request. The server's own text is used only for the statuses
 * above (validation, wrong password, taken email, rate limit); everything else - 5xx, network, timeout -
 * gets a generic sentence, never a raw error.
 */
export function authErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "http" && USER_FACING_STATUSES.has(err.status)) {
      const text = (err.body as { error?: unknown } | undefined)?.error;
      if (typeof text === "string" && text !== "") return text;
    }
    if (err.code === "network" || err.code === "timeout") {
      return "Could not reach the server. Check your connection and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

/** The name the UI shows for a user: the email, or "Demo user" for a demo account (its email is generated). */
export function displayName(user: User): string {
  return user.isDemo ? "Demo user" : user.email;
}
