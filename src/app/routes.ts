// The route table: which component shows for which URL. It is a plain array (not JSX) so tests can
// build a memory router from the very same routes that the real app uses (see main.tsx).
import type { RouteObject } from "react-router";
import { RequireAuth } from "../features/auth/RequireAuth.tsx";
import { CartPage } from "../pages/CartPage.tsx";
import { CheckoutPage } from "../pages/CheckoutPage.tsx";
import { HomePage } from "../pages/HomePage.tsx";
import { LoginPage } from "../pages/LoginPage.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { OrderPage } from "../pages/OrderPage.tsx";
import { OrdersPage } from "../pages/OrdersPage.tsx";
import { ProductPage } from "../pages/ProductPage.tsx";
import { RegisterPage } from "../pages/RegisterPage.tsx";
import { StorePage } from "../pages/StorePage.tsx";
import { Layout } from "./Layout.tsx";
import { RouteError } from "./RouteError.tsx";

export const routes: RouteObject[] = [
  {
    // Layout route: renders the frame; the matching child is drawn at its <Outlet />.
    path: "/",
    Component: Layout,
    children: [
      {
        // A route without a path that only adds an error boundary: if a page crashes, the error
        // message appears inside the layout (header and footer stay) instead of a blank screen.
        ErrorBoundary: RouteError,
        children: [
          { index: true, Component: HomePage },
          { path: "store", Component: StorePage },
          { path: "product/:slug", Component: ProductPage },
          { path: "cart", Component: CartPage },
          { path: "login", Component: LoginPage },
          { path: "register", Component: RegisterPage },
          // Pages for signed-in users only (Task 14). RequireAuth sends everyone else to /login?next=...
          // The cart (above) is open to everyone; its "Checkout" asks for sign-in (Task 16b).
          {
            Component: RequireAuth,
            children: [
              { path: "orders", Component: OrdersPage },
              { path: "orders/:id", Component: OrderPage },
              { path: "checkout/:orderId", Component: CheckoutPage },
            ],
          },
          // "*" matches everything that is left -> 404 page.
          { path: "*", Component: NotFoundPage },
        ],
      },
    ],
  },
];
