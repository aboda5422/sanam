export type ClearingEntry = {
  id: string;
  driver_id: string;
  order_id: string | null;
  receipt_no: string;
  entry_kind: "allocation" | "settlement";
  pay_type: string;
  collection_method: "cash" | "card";
  delivery_fee: number;
  driver_wage: number;
  site_share: number;
  signed_amount: number;
  balance_after: number;
  settlement_method: string | null;
  status: "posted" | "issued" | "acknowledged" | "disputed";
  note: string | null;
  dispute_note: string | null;
  acknowledged_at: string | null;
  disputed_at: string | null;
  created_at: string;
  orders?: { order_number: number | string | null } | null;
};

export function clearingPositionLabel(balance: number) {
  if (balance < -0.004) return "على المندوب للموقع";
  if (balance > 0.004) return "للمندوب على الموقع";
  return "الحساب مصفّى";
}

export function clearingKindLabel(entry: Pick<ClearingEntry, "entry_kind" | "pay_type" | "collection_method">) {
  if (entry.entry_kind === "settlement") return "سند تصفية";
  const who = entry.pay_type === "per_order" ? "نسبة" : "راتب";
  const how = entry.collection_method === "cash" ? "كاش" : "شبكة";
  return `محاصة ${who} · ${how}`;
}

export function clearingStatusLabel(status: ClearingEntry["status"]) {
  switch (status) {
    case "issued":
      return "بانتظار إقرار المندوب";
    case "acknowledged":
      return "أقرّ المندوب بالاستلام";
    case "disputed":
      return "المندوب نازع السداد";
    default:
      return "حركة تلقائية";
  }
}
