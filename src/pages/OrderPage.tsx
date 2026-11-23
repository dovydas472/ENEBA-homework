import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { isHttpStatus } from "../api/orders.ts";
import { orderQuery } from "../api/queries.ts";
import { ErrorState } from "../components/ErrorState.tsx";
import { OrderLoading } from "../features/orders/OrderLoading.tsx";
import { shortOrderId } from "../features/orders/orderText.ts";
import { OrderView } from "../features/orders/OrderView.tsx";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { NotFoundPage } from "./NotFoundPage.tsx";

/**
 * /orders/:id (signed in only). The server answers 404 both for an unknown id and for ANOTHER user's order,
 * so this page cannot tell them apart either - and must not: it shows the normal "Page not found".
 */
export function OrderPage() {
  const { id = "" } = useParams();
  const query = useQuery(orderQuery(id));
  const notFound = isHttpStatus(query.error, 404);
  // "Order #1A2B3C4D": every order has its own tab title (Task 17).
  useDocumentTitle(notFound ? "Page not found" : `Order ${shortOrderId(id)}`);

  if (query.isPending) return <OrderLoading label="Loading the order…" />;
  if (notFound) return <NotFoundPage />;
  if (query.isError) {
    return <ErrorState message="Could not load the order." onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return <OrderView order={query.data.order} />;
}
