// The route table: which component shows for which URL. It is a plain array (not JSX) so tests can
// build a memory router from the very same routes that the real app uses (see main.tsx).
import type { RouteObject } from "react-router";
import { PageSkeleton } from "../components/PageSkeleton.tsx";
import { RequireAuth } from "../features/auth/RequireAuth.tsx";
import { HomePage } from "../pages/HomePage.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { ProductPage } from "../pages/ProductPage.tsx";
import { StorePage } from "../pages/StorePage.tsx";
import { AppError } from "./AppError.tsx";
import { Layout } from "./Layout.tsx";
import { pageLoaders } from "./lazyPages.ts";
import { RouteError } from "./RouteError.tsx";

// Task 17: these pages are loaded on demand (code splitting, see lazyPages.ts) with React Router's route `lazy`:
// the router downloads the page's chunk BEFORE it shows the page, and `.then` hands it the page component.
//  - After a click the current page stays on screen until the chunk is there (usually at once: PrefetchLink has
//    already loaded it on hover / focus / touch).
//  - When such a page is opened directly (typed URL, reload), the layout appears at once with PageSkeleton in the
//    page area (the HydrateFallback below) until the chunk arrives.
//  - A chunk that cannot be downloaded (offline, an old tab after a new deploy) goes to RouteError (Retry / Home).
const cartPage = () => pageLoaders.cart().then((m) => ({ Component: m.CartPage }));
const checkoutPage = () => pageLoaders.checkout().then((m) => ({ Component: m.CheckoutPage }));
const ordersPage = () => pageLoaders.orders().then((m) => ({ Component: m.OrdersPage }));
const orderPage = () => pageLoaders.order().then((m) => ({ Component: m.OrderPage }));
const loginPage = () => pageLoaders.login().then((m) => ({ Component: m.LoginPage }));
const registerPage = () => pageLoaders.register().then((m) => ({ Component: m.RegisterPage }));

export const routes: RouteObject[] = [
  {
    // Layout route: renders the frame; the matching child is drawn at its <Outlet />.
    path: "/",
    Component: Layout,
    // Last line of defence (Task 17): if the frame itself (header, footer...) crashes, this full page replaces it,
    // so the app never shows a blank white screen.
    ErrorBoundary: AppError,
    children: [
      {
        // A route without a path that only adds an error boundary: if a page crashes, the error
        // message appears inside the layout (header and footer stay) instead of a blank screen.
        ErrorBoundary: RouteError,
        // Shown in the page area while a lazily loaded page's chunk downloads on the FIRST load (see above).
        HydrateFallback: PageSkeleton,
        children: [
          { index: true, Component: HomePage },
          { path: "store", Component: StorePage },
          { path: "product/:slug", Component: ProductPage },
          { path: "cart", lazy: cartPage },
          { path: "login", lazy: loginPage },
          { path: "register", lazy: registerPage },
          // Pages for signed-in users only (Task 14). RequireAuth sends everyone else to /login?next=...
          // The cart (above) is open to everyone; its "Checkout" asks for sign-in (Task 16b).
          {
            Component: RequireAuth,
            children: [
              { path: "orders", lazy: ordersPage },
              { path: "orders/:id", lazy: orderPage },
              { path: "checkout/:orderId", lazy: checkoutPage },
            ],
          },
          // "*" matches everything that is left -> 404 page.
          { path: "*", Component: NotFoundPage },
        ],
      },
    ],
  },
];
