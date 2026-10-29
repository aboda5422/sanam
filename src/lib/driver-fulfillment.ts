/** Cash COD, or non-cash only after successful payment. */
export function orderPaymentAllowsDriverWork(order: {
  payment_method?: string | null;
  payment_status?: string | null;
}): boolean {
  const method = (order.payment_method || "").toLowerCase();
  if (method === "cash") return true;
  return order.payment_status === "paid";
}
