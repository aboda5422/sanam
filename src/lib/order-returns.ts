export type OrderReturnStatus =
  | "awaiting_pickup"
  | "assigned"
  | "picked_up"
  | "refunded"
  | "cancelled"
  | "refund_failed";

export const RETURN_STATUS_LABELS: Record<OrderReturnStatus, string> = {
  awaiting_pickup: "بانتظار المندوب",
  assigned: "المندوب في الطريق للاستلام",
  picked_up: "تم الاستلام — جاري الاسترداد",
  refunded: "تم الاسترداد",
  cancelled: "ملغي",
  refund_failed: "فشل الاسترداد",
};
