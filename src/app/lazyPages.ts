// Route code splitting (Task 17). Home, Store and Product are in the main bundle: they are where visitors land,
// so their code must be there at once. The pages below are reached later (after a click), so each one is a separate
// JS file ("chunk") that the browser downloads only when it is needed - or earlier, when a link to it is hovered
// (PrefetchLink calls the same loader, see prefetch.ts).
//
// A loader is just a dynamic import(). The bundler (Vite) turns every import() into its own chunk, and the browser
// keeps a module it has loaded once: calling the same loader again costs nothing. That is why routes.ts (route `lazy`)
// and the hover prefetch can both call these functions without downloading anything twice.

export const pageLoaders = {
  cart: () => import("../pages/CartPage.tsx"),
  checkout: () => import("../pages/CheckoutPage.tsx"),
  orders: () => import("../pages/OrdersPage.tsx"),
  order: () => import("../pages/OrderPage.tsx"),
  login: () => import("../pages/LoginPage.tsx"),
  register: () => import("../pages/RegisterPage.tsx"),
};

export type LazyPage = keyof typeof pageLoaders;

/** Tests: loads every lazy page up front, so a test never waits for a module to be transformed mid-render. */
export function loadAllPages(): Promise<unknown> {
  return Promise.all(Object.values(pageLoaders).map((load) => load()));
}
