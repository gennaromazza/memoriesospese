import type { QueryClient } from "@tanstack/react-query";

const financialInputs = new Set([
  "cash-movements", "financial-summary", "monthly-data", "forecasted-income",
  "orders", "walk-in-orders", "bookings", "booking-campaigns", "jobs",
  "payment-schedules", "paymentSchedule", "paymentSchedules",
]);

/** Share the same update policy with the app and isolated browser fixtures. */
export function attachFinanceRefresh(client: QueryClient): () => void {
  let queued = false;
  let disposed = false;
  const invalidate = () => {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!disposed) void client.invalidateQueries({ queryKey: ["finance-dashboard"] });
    });
  };
  const stopQueries = client.getQueryCache().subscribe(event => {
    if (event.type === "updated" && event.action.type === "invalidate" &&
        financialInputs.has(String(event.query.queryKey[0]))) invalidate();
  });
  const stopMutations = client.getMutationCache().subscribe(event => {
    // Also covers mutations whose original invalidation missed a financial key.
    if (event.type === "updated" && event.action.type === "success") invalidate();
  });
  return () => { disposed = true; stopQueries(); stopMutations(); };
}