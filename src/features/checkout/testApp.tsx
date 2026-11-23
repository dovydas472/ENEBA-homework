// Test helper (used only by *.test.tsx) for the checkout and order pages: the REAL app routes in a memory router,
// with apiFetch answered by the in-memory fake server (fakeAuthServer.ts). Every module-level store the pages use
// (cart, line statuses, attempt key, toast) is reset between tests.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../app/routes.ts";
import { render } from "../../test-utils.tsx";
import { cartStore } from "../cart/cartStore.ts";
import { checkoutAttempt } from "./attemptKey.ts";
import { lineStatusStore } from "./lineStatusStore.ts";

export type TestRouter = ReturnType<typeof createMemoryRouter>;

let cleanup: (() => void) | undefined;

export function resetCheckoutState() {
  cleanup?.();
  cleanup = undefined;
  cartStore.clear();
  lineStatusStore.reset();
  checkoutAttempt.clear();
  window.scrollTo = (() => {}) as never; // jsdom has no scrolling; the layout's ScrollRestoration calls it
}

export function unmountApp() {
  cleanup?.();
  cleanup = undefined;
}

/** TanStack Query hands results to React through timers: wait a few ticks. */
export async function settle() {
  for (let tick = 0; tick < 6; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
}
export const flush = () => act(settle);

export async function mountApp(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
  await flush();
  return { router, queryClient };
}

export const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
export const $$ = <T extends Element = HTMLElement>(selector: string) => [...document.querySelectorAll<T>(selector)];
export const urlOf = (router: TestRouter) => router.state.location.pathname + router.state.location.search;

/** The <button> (or link) inside `root` whose visible text starts with `text`. */
export function buttonByText(text: string, root: ParentNode = document): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim().startsWith(text));
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

export async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
    await settle();
  });
}

/** The text of the toast on screen. */
export const toastText = () => $("[role=status] p")?.textContent ?? null;
