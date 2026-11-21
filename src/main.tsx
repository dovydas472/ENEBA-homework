import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
// Global styles first: tokens.css defines the variables, global.css uses them.
// They must come before the app so component CSS Modules can override the base styles.
import "./styles/tokens.css";
import "./styles/global.css";
import { createQueryClient } from "./app/queryClient.ts";
import { routes } from "./app/routes.ts";

// Both are created once, outside React, so they live as long as the page.
const queryClient = createQueryClient(); // the cache for all server data
const router = createBrowserRouter(routes); // URL <-> pages (history API, so no "#" in URLs)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
