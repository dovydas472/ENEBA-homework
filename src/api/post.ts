// POST helper shared by auth.ts and orders.ts (moved out of auth.ts in Task 16b).
// It is a separate module on purpose: tests replace `apiFetch` (vi.mock of client.ts), and only calls that go
// through the module's EXPORT see the replacement - a helper inside client.ts would call the real one.
import { apiFetch, type ApiOptions } from "./client.ts";

/**
 * POST with an optional JSON body. The browser adds the Origin header itself; the server checks it (CSRF, Task 14).
 */
export function postJSON<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
