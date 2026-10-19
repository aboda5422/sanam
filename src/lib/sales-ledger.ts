/** أجر المندوب الذي خرج فعلاً من قيمة الطلب عند التسوية. */

export type SalesLedgerOrder = {
  id: string;
  driver_id: string | null;
  status: string;
  payment_method: string;
  total: number;
  collected_amount: number | null;
  cash_settled_at?: string | null;
};

export type SalesWalletTx = {
  order_id: string | null;
  driver_id: string;
  type: string;
  amount: number;
  notes: string | null;
  created_at: string;
};

export type OrderExpense = {
  amount: number;
  at: string;
  label: string;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function isCashRemitSettlement(tx: SalesWalletTx) {
  const notes = tx.notes || "";
  return tx.type === "settlement" && !notes.includes("أجور التوصيل") && !notes.includes("صرف أجر");
}

function isNetworkWagePayout(tx: SalesWalletTx) {
  return tx.type === "settlement" && (tx.notes || "").includes("صرف أجر");
}

export function commissionByOrder(txs: SalesWalletTx[]) {
  const map = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type !== "commission" || !tx.order_id) continue;
    map.set(tx.order_id, round2((map.get(tx.order_id) || 0) + Number(tx.amount || 0)));
  }
  return map;
}

/**
 * منصرف أجر التوصيل لكل طلب.
 * الكاش: الفرق بين المحصّل من العميل وما سلّمه المندوب في نفس التسوية، ويُوزَّع على أجور الطلبات.
 * الشبكة: مبلغ صرف الأجر بعد ما تصل قيمة الطلب إلى البنك.
 */
export function driverWageExpenses(orders: SalesLedgerOrder[], txs: SalesWalletTx[]) {
  const result = new Map<string, OrderExpense>();
  const commission = commissionByOrder(txs);
  const cashSettlements = txs.filter(isCashRemitSettlement);

  const groups = new Map<string, SalesLedgerOrder[]>();
  for (const order of orders) {
    if (order.status !== "delivered" || order.payment_method !== "cash" || !order.cash_settled_at || !order.driver_id) {
      continue;
    }
    const key = `${order.driver_id}|${order.cash_settled_at}`;
    const list = groups.get(key) || [];
    list.push(order);
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    const driverId = list[0].driver_id as string;
    const settledAt = list[0].cash_settled_at as string;
    const settledMs = new Date(settledAt).getTime();
    const tx = cashSettlements
      .filter((row) => row.driver_id === driverId)
      .map((row) => ({ row, delta: Math.abs(new Date(row.created_at).getTime() - settledMs) }))
      .filter((item) => item.delta < 2000)
      .sort((a, b) => a.delta - b.delta)[0]?.row;
    if (!tx) continue;

    const gross = round2(
      list.reduce((sum, order) => sum + Math.max(0, Number(order.collected_amount ?? order.total ?? 0)), 0),
    );
    let deducted = round2(gross - Number(tx.amount || 0));
    if (deducted <= 0) continue;

    const ranked = [...list].sort((a, b) => (commission.get(b.id) || 0) - (commission.get(a.id) || 0));
    for (const order of ranked) {
      if (deducted <= 0) break;
      const wage = commission.get(order.id) || 0;
      if (wage <= 0) continue;
      const take = round2(Math.min(wage, deducted));
      result.set(order.id, { amount: take, at: settledAt, label: "أجر توصيل" });
      deducted = round2(deducted - take);
    }
    if (deducted > 0) {
      const target = ranked[0];
      const prev = result.get(target.id);
      result.set(target.id, {
        amount: round2((prev?.amount || 0) + deducted),
        at: settledAt,
        label: "أجر توصيل",
      });
    }
  }

  for (const order of orders) {
    if (order.status !== "delivered" || order.payment_method === "cash") continue;
    const payouts = txs.filter((tx) => isNetworkWagePayout(tx) && tx.order_id === order.id);
    const amount = round2(payouts.reduce((sum, tx) => sum + Number(tx.amount || 0), 0));
    if (amount <= 0) continue;
    const at = [...payouts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).at(-1)
      ?.created_at;
    result.set(order.id, { amount, at: at || order.cash_settled_at || "", label: "صرف أجر شبكة" });
  }

  return result;
}
