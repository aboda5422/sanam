import { supabase } from "@/integrations/supabase/client";

/** ما لم يُسوَّ بعد: ما يسلّمه المحصل، والنقد الكامل الذي بحوزة المندوب، وأجر الشبكة الذي يُصرف له. */
export type DriverOpenPosition = {
  cashDue: number;
  cashGross: number;
  cardWage: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function emptyDriverPosition(): DriverOpenPosition {
  return { cashDue: 0, cashGross: 0, cardWage: 0 };
}

export async function loadDriverOpenPositions(): Promise<Map<string, DriverOpenPosition>> {
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, driver_id, total, collected_amount, payment_method, cash_settled_at")
    .eq("status", "delivered")
    .or("cash_settled_at.is.null,payment_method.neq.cash");
  if (ordersError) throw ordersError;

  const rows = (orders || []).filter((order) => order.driver_id);
  const ids = rows.map((order) => order.id);
  const wageByOrder = new Map<string, number>();
  const paidCard = new Set<string>();

  if (ids.length) {
    const { data: txs, error: txError } = await supabase
      .from("wallet_transactions")
      .select("order_id, type, amount, notes")
      .in("order_id", ids)
      .in("type", ["commission", "settlement"]);
    if (txError) throw txError;
    for (const tx of txs || []) {
      if (!tx.order_id) continue;
      if (tx.type === "commission") {
        wageByOrder.set(tx.order_id, (wageByOrder.get(tx.order_id) || 0) + Number(tx.amount || 0));
      } else if ((tx.notes || "").includes("صرف أجر")) {
        paidCard.add(tx.order_id);
      }
    }
  }

  const byDriver = new Map<string, DriverOpenPosition>();
  for (const order of rows) {
    const driverId = order.driver_id;
    if (!driverId) continue;
    const wage = wageByOrder.get(order.id) || 0;
    const pos = byDriver.get(driverId) || emptyDriverPosition();
    const card = order.payment_method !== "cash";
    if (!card && !order.cash_settled_at) {
      const gross = Math.max(0, Number(order.collected_amount || order.total || 0));
      pos.cashGross = round2(pos.cashGross + gross);
      pos.cashDue = round2(pos.cashDue + Math.max(0, gross - wage));
    } else if (card && wage > 0 && !paidCard.has(order.id)) {
      pos.cardWage = round2(pos.cardWage + wage);
    }
    byDriver.set(driverId, pos);
  }
  return byDriver;
}
