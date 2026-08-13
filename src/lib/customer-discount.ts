export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Discount on product subtotal (delivery is not discounted). */
export function applyCustomerDiscount(subtotal: number, percent: number | null | undefined) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  const amount = roundMoney(subtotal * (p / 100));
  return { percent: p, amount };
}
