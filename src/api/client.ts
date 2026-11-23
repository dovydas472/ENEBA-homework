// Reusable API client: every API call in the app goes through apiFetch.

/** How long a request may run before we give up (ms). */
export const REQUEST_TIMEOUT_MS = 15_000;

export type ApiErrorCode = "http" | "network" | "timeout" | "parse";

/**
 * The only error type apiFetch throws (besides a caller-initiated abort).
 * - http:    server answered with non-2xx; `status` and parsed `body` are set
 * - network: request never got an answer (server down, offline)
 * - timeout: no answer within the timeout
 * - parse:   2xx answer that is not valid JSON
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number; // 0 when there was no HTTP response
  readonly body: unknown; // parsed JSON error body, if the server sent one

  constructor(code: ApiErrorCode, message: string, status = 0, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

export type ApiOptions = Omit<RequestInit, "signal"> & {
  /** Abort from outside (e.g. React effect cleanup). */
  signal?: AbortSignal;
  /** Override the default timeout. */
  timeoutMs?: number;
};

/**
 * fetch + JSON parsing + typed errors + timeout.
 * Resolves with the parsed JSON body of a 2xx response, otherwise throws ApiError.
 * 204 No Content (e.g. sign out) has no body by definition: it resolves with `undefined`.
 * If the caller's own `signal` aborts, the original AbortError is rethrown.
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { signal: callerSignal, timeoutMs = REQUEST_TIMEOUT_MS, ...init } = options;

  // One controller drives the fetch; it is aborted by the timeout OR the caller.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener("abort", onCallerAbort);

  try {
    let res: Response;
    try {
      res = await fetch(path, {
        ...init,
        headers: { Accept: "application/json", ...init.headers },
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) throw new ApiError("timeout", `Request timed out after ${timeoutMs} ms`);
      if (callerSignal?.aborted) throw err; // caller cancelled: not an API failure
      throw new ApiError("network", "Network error");
    }

    // Read the body as text first: error responses (or proxies) may be empty / not JSON.
    const text = await res.text();
    let json: unknown;
    let parsed = false;
    if (text) {
      try {
        json = JSON.parse(text);
        parsed = true;
      } catch {
        /* handled below */
      }
    }

    if (!res.ok) {
      throw new ApiError("http", `HTTP ${res.status}`, res.status, parsed ? json : undefined);
    }
    if (res.status === 204) return undefined as T;
    if (!parsed) throw new ApiError("parse", "Response is not valid JSON", res.status);
    return json as T;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}
