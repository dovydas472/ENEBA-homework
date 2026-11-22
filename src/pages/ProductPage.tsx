import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { ApiError } from "../api/client.ts";
import { productQuery } from "../api/queries.ts";
import { ErrorState } from "../components/ErrorState.tsx";
import { ProductView, ProductViewSkeleton } from "../features/product/ProductView.tsx";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { NotFoundPage } from "./NotFoundPage.tsx";

/**
 * /product/:slug. The data comes from the shared productQuery (src/api/queries.ts) - the SAME cache entry the
 * Store card fills on hover, so after a hover the page usually opens without any loading state.
 *   data       -> the page            404        -> the 404 page (inside the layout)
 *   loading    -> skeleton            other error -> ErrorState with Retry
 */
export function ProductPage() {
  const { slug = "" } = useParams();
  const query = useQuery(productQuery(slug));
  const notFound = query.error instanceof ApiError && query.error.status === 404;

  // One title for every state (NotFoundPage sets the same one; the parent's effect would run last otherwise).
  useDocumentTitle(notFound ? "Page not found" : (query.data?.game.title ?? "Product"));

  if (query.data) return <ProductView detail={query.data} />;
  if (notFound) return <NotFoundPage />;
  if (query.isError) {
    return (
      <ErrorState
        message="We could not load this product. Please try again in a moment."
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  return <ProductViewSkeleton />;
}
