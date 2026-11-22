// Test helper (used only by *.test.tsx): a tiny in-memory stand-in for the auth API, plugged in as the
// implementation of the mocked apiFetch. It answers GET /api/auth/me from `state.user` and every other
// request from `state.handlers`; an unexpected request fails the test loudly.
import { ApiError, type ApiOptions } from "../../api/client.ts";
import type { User } from "../../api/auth.ts";

export interface FakeAuthState {
  /** Who GET /api/auth/me says is signed in (null = 401). */
  user: User | null;
  /** "POST /api/auth/login" -> what to answer (return a value, or throw an ApiError). */
  handlers: Record<string, (body: unknown) => unknown>;
  /** Every request as "METHOD path" plus its parsed JSON body, in order. */
  requests: { key: string; body: unknown }[];
}

export function newFakeAuthState(): FakeAuthState {
  return { user: null, handlers: {}, requests: [] };
}

/** An HTTP error the way apiFetch throws it, with the server's {"error": "..."} body. */
export function httpError(status: number, error: string): ApiError {
  return new ApiError("http", `HTTP ${status}`, status, { error });
}

/** The function to pass to `vi.mocked(apiFetch).mockImplementation(...)`. */
export function fakeAuthServer(state: FakeAuthState) {
  return async (path: string, options?: ApiOptions): Promise<never> => {
    const key = `${options?.method ?? "GET"} ${path}`;
    const body = typeof options?.body === "string" ? JSON.parse(options.body) : undefined;
    state.requests.push({ key, body });
    if (key === "GET /api/auth/me") {
      if (state.user) return { user: state.user } as never;
      throw httpError(401, "not signed in");
    }
    const handler = state.handlers[key];
    if (!handler) throw new Error(`unexpected request ${key}`);
    return handler(body) as never;
  };
}
