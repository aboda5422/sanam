export type SettlementType = "cash" | "transfer" | "electronic";

export const SETTLEMENT_TYPE_LABEL: Record<SettlementType, string> = {
  cash: "سداد كاش",
  transfer: "سداد تحويل",
  electronic: "دفع إلكتروني",
};

export const SETTLEMENT_TYPE_BADGE: Record<SettlementType, string> = {
  cash: "bg-amber-100 text-amber-900 border-amber-200",
  transfer: "bg-indigo-100 text-indigo-900 border-indigo-200",
  electronic: "bg-sky-100 text-sky-900 border-sky-200",
};

export type CollectionStatusKey = "collected" | "not_collected" | "awaiting_delivery" | "awaiting_customer_pay";

export const COLLECTION_STATUS_LABEL: Record<CollectionStatusKey, string> = {
  collected: "تم التحصيل",
  not_collected: "لم يتم التحصيل",
  awaiting_delivery: "بانتظار التسليم",
  awaiting_customer_pay: "بانتظار تحصيل العميل",
};

export const COLLECTION_STATUS_BADGE: Record<CollectionStatusKey, string> = {
  collected: "bg-green-100 text-green-800 border-0",
  not_collected: "bg-amber-100 text-amber-800 border-0",
  awaiting_delivery: "bg-muted text-muted-foreground border-0",
  awaiting_customer_pay: "bg-muted text-muted-foreground border-0",
};

export function retailSettlementType(paymentMethod: string | null | undefined): SettlementType {
  const pm = (paymentMethod || "").toLowerCase();
  if (pm === "cash") return "cash";
  if (pm === "bank_transfer" || pm === "transfer") return "transfer";
  return "electronic";
}

export function wholesaleSettlementType(input: {
  cod_allowed?: boolean | null;
  payment_method?: string | null;
  retail_payment_method?: string | null;
  collection_settled_at?: string | null;
  collection_settlement_method?: string | null;
}): SettlementType {
  const recorded = (input.collection_settlement_method || "").toLowerCase();
  if (recorded === "cash") return "cash";
  if (recorded === "bank_transfer" || recorded === "transfer") return "transfer";
  if (recorded === "online") return "electronic";

  if (input.cod_allowed) return "cash";

  const pm = (input.payment_method || input.retail_payment_method || "").toLowerCase();
  if (pm === "cash") return "cash";
  if (pm === "bank_transfer" || pm === "transfer") return "transfer";
  if (pm === "online" || pm === "card") return "electronic";

  if (input.collection_settled_at) return "cash";

  if (pm) return "electronic";
  return "transfer";
}

export function retailCollectionStatus(o: {
  status: string;
  payment_method: string;
  collected_amount?: number | null;
  cash_settled_at?: string | null;
}): CollectionStatusKey {
  if (o.status !== "delivered") return "awaiting_delivery";
  const type = retailSettlementType(o.payment_method);
  if (type === "electronic" || type === "transfer") return "collected";
  if (type === "cash") {
    if (Number(o.collected_amount || 0) <= 0) return "awaiting_customer_pay";
    return o.cash_settled_at ? "collected" : "not_collected";
  }
  return "awaiting_delivery";
}

export function wholesaleCollectionStatus(o: {
  status: string;
  cod_allowed?: boolean | null;
  payment_method?: string | null;
  collection_settled_at?: string | null;
  collection_settlement_method?: string | null;
  retail_order?: {
    payment_method?: string | null;
    status?: string;
    collected_amount?: number | null;
    cash_settled_at?: string | null;
  } | null;
}): CollectionStatusKey {
  const completed = ["completed", "converted"].includes(o.status);
  if (!completed) return "awaiting_delivery";

  const type = wholesaleSettlementType({
    cod_allowed: o.cod_allowed,
    payment_method: o.payment_method,
    retail_payment_method: o.retail_order?.payment_method,
    collection_settled_at: o.collection_settled_at,
    collection_settlement_method: o.collection_settlement_method,
  });

  if (type === "electronic" || type === "transfer") return "collected";

  if (o.collection_settled_at) return "collected";

  const ro = o.retail_order;
  if (ro?.payment_method === "cash" && ro.status === "delivered") {
    if (Number(ro.collected_amount || 0) <= 0) return "awaiting_customer_pay";
    return ro.cash_settled_at ? "collected" : "not_collected";
  }

  if (o.cod_allowed && !o.collection_settled_at) return "not_collected";

  return "awaiting_delivery";
}
