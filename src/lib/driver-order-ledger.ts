import type { DriverLedgerRow } from "@/lib/driver-transactions-print";

export type LedgerOrder = {
  id: string;
  order_number: number | null;
  delivery_fee: number | null;
  total: number | null;
  payment_method: string | null;
  delivered_at: string | null;
  created_at: string;
  cash_settled_at: string | null;
};

export type LedgerSource = {
  orders: LedgerOrder[];
  wages: { order_id: string | null; amount: number }[];
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** صف لكل طلب مسلّم. الكاش: يسلّم المتبقي بعد أجره. الشبكة: قيمة الطلب صفر، والرصيد يتحرك بأجره. الرصيد يجمع غير المسوّى فقط. */
export function buildOrderLedger(source: LedgerSource): DriverLedgerRow[] {
  const wageByOrder = new Map<string, number>();
  for (const wage of source.wages) {
    if (!wage.order_id) continue;
    wageByOrder.set(wage.order_id, (wageByOrder.get(wage.order_id) || 0) + Number(wage.amount || 0));
  }

  const chronological = [...source.orders].sort(
    (a, b) => new Date(a.delivered_at || a.created_at).getTime() - new Date(b.delivered_at || b.created_at).getTime(),
  );
  let openBalance = 0;
  const rows = chronological.map((order) => {
    const delivery = Math.max(0, Number(order.delivery_fee || 0));
    const goods = Math.max(0, Number(order.total || 0) - delivery);
    const card = order.payment_method !== "cash";
    const wage = wageByOrder.get(order.id) || 0;
    const siteShare = round2(Math.max(0, delivery - wage));
    const received = card ? 0 : goods + delivery;
    const effect = round2(wage - received);
    const settled = !card && !!order.cash_settled_at;
    if (!settled) openBalance = round2(openBalance + effect);
    return {
      id: order.id,
      at: order.delivered_at || order.created_at,
      orderNumber: String(order.order_number ?? "—"),
      channel: card ? "card" as const : "cash" as const,
      goods: card ? 0 : goods,
      delivery,
      wage,
      siteShare,
      effect,
      balance: openBalance,
      status: card ? "card" as const : settled ? "collected" as const : "pending" as const,
    };
  });
  return rows.reverse();
}
