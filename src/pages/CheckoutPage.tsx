import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { isHttpStatus } from "../api/orders.ts";
import { orderQuery } from "../api/queries.ts";
import { ErrorState } from "../components/ErrorState.tsx";
import { PaymentView } from "../features/checkout/PaymentView.tsx";
import { OrderLoading } from "../features/orders/OrderLoading.tsx";
import { shortOrderId } from "../features/orders/orderText.ts";
import { useDocumentTitle } from "../lib/useDocumentTitle.ts";
import { NotFoundPage } from "./NotFoundPage.tsx";

/** /checkout/:orderId (signed in only): loads the order, then the payment view. Unknown or another user's order = 404. */
export function CheckoutPage() {
  const { orderId = "" } = useParams();
  const query = useQuery(orderQuery(orderId));
  const notFound = isHttpStatus(query.error, 404);
  // "Payment for order #1A2B3C4D": every order has its own tab title (Task 17).
  useDocumentTitle(notFound ? "Page not found" : `Payment for order ${shortOrderId(orderId)}`);

  if (query.isPending) return <OrderLoading label="Loading the order…" />;
  if (notFound) return <NotFoundPage />;
  if (query.isError) {
    return <ErrorState message="Could not load the order." onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return <PaymentView data={query.data} receivedAt={query.dataUpdatedAt} reload={() => void query.refetch()} />;
}
