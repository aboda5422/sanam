import { roundMoney } from "@/lib/customer-discount";

/** KSA VAT. Catalog prices are tax-inclusive. */
export const VAT_RATE = 0.15;

export function splitInclusiveVat(inclusive: number, rate = VAT_RATE) {
  const inc = roundMoney(inclusive);
  const exclusive = roundMoney(inc / (1 + rate));
  const vat = roundMoney(inc - exclusive);
  return { inclusive: inc, exclusive, vat };
}
