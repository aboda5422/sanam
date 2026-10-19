/** Build a thermal-friendly receipt text + browser print HTML. */

import { BRAND } from "@/lib/brand";

export type ReceiptLine = {
  name: string;
  qty: number;
  price: number;
  total: number;
};

export type ReceiptData = {
  storeName: string;
  branchName: string;
  stationName: string;
  invoiceNumber: string;
  cashierName: string;
  createdAt: string;
  lines: ReceiptLine[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  payments: { method: string; amount: number }[];
  change?: number;
  footer?: string;
  taxRate?: number;
  crNumber?: string;
};

const methodAr: Record<string, string> = {
  cash: "نقداً",
  card: "بطاقة / شبكة",
  transfer: "تحويل",
  other: "أخرى",
};

export function buildReceiptText(r: ReceiptData): string {
  const w = 32;
  const line = (ch = "-") => ch.repeat(w);
  const rows: string[] = [
    center(r.storeName || BRAND.nameAr, w),
    center(r.branchName, w),
    line("="),
    `فاتورة: ${r.invoiceNumber}`,
    `المحطة: ${r.stationName}`,
    `الكاشير: ${r.cashierName}`,
    `الوقت: ${r.createdAt}`,
    line(),
  ];
  for (const l of r.lines) {
    rows.push(truncate(l.name, w));
    rows.push(`${l.qty} x ${fmt(l.price)}`.padEnd(16) + fmt(l.total).padStart(16));
  }
  rows.push(line());
  rows.push(kv("المجموع قبل الضريبة", fmt(r.subtotal), w));
  if (r.discountTotal > 0) rows.push(kv("الخصم", fmt(r.discountTotal), w));
  rows.push(kv(`الضريبة (${r.taxRate ?? 15}%)`, fmt(r.taxTotal), w));
  rows.push(kv("الإجمالي", fmt(r.total), w));
  rows.push(line());
  for (const p of r.payments) {
    rows.push(kv(methodAr[p.method] || p.method, fmt(p.amount), w));
  }
  if (r.change && r.change > 0) rows.push(kv("الباقي", fmt(r.change), w));
  if (r.crNumber) rows.push(center(`س.ت ${r.crNumber}`, w));
  rows.push(line("="));
  rows.push(center(r.footer || BRAND.taglineAr, w));
  rows.push("");
  rows.push("");
  return rows.join("\n");
}

export function printReceipt(r: ReceiptData) {
  const text = buildReceiptText(r);
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>${r.invoiceNumber}</title>
<style>
  body{font-family:ui-monospace,Consolas,monospace;font-size:12px;margin:12px;white-space:pre-wrap}
  @media print{body{margin:0}}
</style></head><body>${escapeHtml(text)}</body></html>`;
  const win = window.open("", "_blank", "width=420,height=720");
  if (!win) return text;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 250);
  return text;
}

/** Payload a local print bridge can convert to ESC/POS. */
export function receiptBridgePayload(r: ReceiptData) {
  return {
    type: "sanam_pos_receipt_v1",
    text: buildReceiptText(r),
    meta: {
      invoice: r.invoiceNumber,
      total: r.total,
      branch: r.branchName,
      station: r.stationName,
    },
  };
}

function fmt(n: number) {
  return n.toFixed(2);
}
function center(s: string, w: number) {
  const t = truncate(s, w);
  const pad = Math.max(0, Math.floor((w - t.length) / 2));
  return " ".repeat(pad) + t;
}
function kv(k: string, v: string, w: number) {
  const left = truncate(k, w - v.length - 1);
  return left + " ".repeat(Math.max(1, w - left.length - v.length)) + v;
}
function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
