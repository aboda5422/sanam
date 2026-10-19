import logoFull from "@/assets/logo-full.png";
import {
  ARABIC_PRINT_BASE_CSS,
  ARABIC_PRINT_FONT_LINKS,
  ARABIC_PRINT_ONLOAD_SCRIPT,
  openArabicPrintHtml,
} from "@/lib/arabic-print-document";
import { BRAND } from "@/lib/brand";

export type DriverLedgerRow = {
  id: string;
  at: string;
  orderNumber: string;
  channel: "cash" | "card";
  goods: number;
  delivery: number;
  wage: number;
  /** حصة الموقع من أجرة التوصيل بعد خصم أجر المندوب. */
  siteShare: number;
  /** موجب: للمندوب. سالب: على المندوب. */
  effect: number;
  /** رصيد ما لم يُسوَّ بعد هذه العملية. الحركات المسوّاة لا تتراكم. */
  balance: number;
  status: "collected" | "pending" | "card";
};

export function ledgerStatusLabel(status: DriverLedgerRow["status"]) {
  if (status === "collected") return "تم التسوية";
  if (status === "pending") return "لم تتم التسوية";
  return "شبكة";
}

export function ledgerSignedLabel(amount: number) {
  const abs = `${Math.abs(amount).toFixed(2)} ر.س`;
  if (amount > 0) return `له ${abs}`;
  if (amount < 0) return `عليه ${abs}`;
  return "0.00 ر.س";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number) {
  return `${Number(n).toFixed(2)} ر.س`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function periodLabel(from: string, to: string) {
  if (from && to) return `${from} → ${to}`;
  if (from) return `من ${from}`;
  if (to) return `حتى ${to}`;
  return "كل الفترات";
}

async function logoDataUrl() {
  const res = await fetch(logoFull);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function openDriverTransactionsPrint(opts: {
  driverName: string;
  from: string;
  to: string;
  rows: DriverLedgerRow[];
  hideSiteShare?: boolean;
}) {
  const logo = await logoDataUrl();
  const title = `معاملات المندوب — ${opts.driverName}`;
  const goods = opts.rows.reduce((s, r) => s + r.goods, 0);
  const delivery = opts.rows.reduce((s, r) => s + r.delivery, 0);
  const wage = opts.rows.reduce((s, r) => s + r.wage, 0);
  const siteShare = opts.rows.reduce((s, r) => s + r.siteShare, 0);
  const closing = opts.rows[0]?.balance ?? 0;

  const rowsHtml = opts.rows
    .map(
      (r) => `<tr>
        <td>#${escapeHtml(r.orderNumber)}<div class="muted">${escapeHtml(fmtDate(r.at))}</div></td>
        <td>${escapeHtml(r.channel === "card" ? "شبكة" : "كاش")}</td>
        <td>${escapeHtml(money(r.goods))}</td>
        <td>${escapeHtml(money(r.delivery))}</td>
        <td>${escapeHtml(money(r.wage))}</td>
        ${opts.hideSiteShare ? "" : `<td>${escapeHtml(money(r.siteShare))}</td>`}
        <td>${escapeHtml(ledgerSignedLabel(r.effect))}</td>
        <td>${escapeHtml(ledgerSignedLabel(r.balance))}</td>
        <td>${escapeHtml(ledgerStatusLabel(r.status))}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  ${ARABIC_PRINT_FONT_LINKS}
  <style>
    ${ARABIC_PRINT_BASE_CSS}
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Noto Naskh Arabic", "Segoe UI", Tahoma, Arial, sans-serif; color: #1f2937; }
    .wrap { padding: 16px 20px; }
    .actions { margin-bottom: 12px; }
    .actions button { background: #0A0A0A; color: #fff; border: 0; padding: 8px 14px; border-radius: 8px; cursor: pointer; font: inherit; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0A0A0A; padding-bottom: 10px; margin-bottom: 12px; }
    .head img { height: 52px; border-radius: 8px; }
    h1 { margin: 0; font-size: 18px; color: #0A0A0A; }
    .meta { font-size: 12px; color: #4b5563; line-height: 1.7; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: right; }
    th { background: #f3f4f6; }
    .muted { color: #6b7280; font-size: 11px; }
    .subs { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 10px 24px; font-size: 13px; }
    .foot { margin-top: 16px; font-size: 10px; color: #9ca3af; text-align: center; }
    @media print { .actions { display: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="actions"><button type="button" onclick="window.print()">حفظ / طباعة PDF</button></div>
    <div class="head">
      <div>
        <img src="${logo}" alt="" />
        <h1>${escapeHtml(title)}</h1>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280">${escapeHtml(BRAND.fullNameAr)}</p>
      </div>
      <div style="font-size:11px;text-align:left">${escapeHtml(new Date().toLocaleString("ar-SA"))}</div>
    </div>
    <div class="meta">
      <div><strong>المندوب:</strong> ${escapeHtml(opts.driverName)}</div>
      <div><strong>الفترة:</strong> ${escapeHtml(periodLabel(opts.from, opts.to))}</div>
      <div><strong>عدد الطلبات:</strong> ${opts.rows.length}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>الطلب</th>
          <th>الدفع</th>
          <th>قيمة الطلب</th>
          <th>التوصيل</th>
          <th>أجر المندوب</th>
          ${opts.hideSiteShare ? "" : "<th>حصة الموقع</th>"}
          <th>المتبقي</th>
          <th>الرصيد</th>
          <th>الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="${opts.hideSiteShare ? 8 : 9}" style="text-align:center;color:#6b7280">لا معاملات في هذه الفترة</td></tr>`}
      </tbody>
    </table>
    <div class="subs">
      <div><strong>مجموع قيمة الطلبات المستلمة:</strong> ${escapeHtml(money(goods))}</div>
      <div><strong>مجموع التوصيل:</strong> ${escapeHtml(money(delivery))}</div>
      <div><strong>مجموع أجر المندوب:</strong> ${escapeHtml(money(wage))}</div>
      ${opts.hideSiteShare ? "" : `<div><strong>مجموع حصة الموقع:</strong> ${escapeHtml(money(siteShare))}</div>`}
      <div><strong>الرصيد الختامي:</strong> ${escapeHtml(ledgerSignedLabel(closing))}</div>
    </div>
    <div class="foot">${escapeHtml(BRAND.copyrightAr)}</div>
  </div>
  ${ARABIC_PRINT_ONLOAD_SCRIPT}
</body>
</html>`;

  openArabicPrintHtml(html);
}
