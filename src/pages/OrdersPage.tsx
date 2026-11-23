import { useQuery } from "@tanstack/react-query";
import { orderListQuery } from "../api/queries.ts";
import { ErrorState } from "../components/ErrorState.tsx";
import { OrderList } from "../features/orders/OrderList.tsx";
import { OrderLoading } from "../features/orders/OrderLoading.tsx";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";

/** /orders (signed in only, RequireAuth): the user's orders, newest first. */
export function OrdersPage() {
  useDocumentTitle("Orders");
  const query = useQuery(orderListQuery());

  if (query.isPending) return <OrderLoading label="Loading your orders…" />;
  if (query.isError) {
    return <ErrorState message="Could not load your orders." onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return <OrderList orders={query.data} />;
}
