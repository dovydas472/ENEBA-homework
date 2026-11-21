// The route table: which component shows for which URL. It is a plain array (not JSX) so tests can
// build a memory router from the very same routes that the real app uses (see main.tsx).
import type { RouteObject } from "react-router";
import { CartPage } from "../pages/CartPage.tsx";
import { HomePage } from "../pages/HomePage.tsx";
import { LoginPage } from "../pages/LoginPage.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
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
          { path: "orders", Component: OrdersPage },
          // "*" matches everything that is left -> 404 page.
          { path: "*", Component: NotFoundPage },
        ],
      },
    ],
  },
];
