import logoFull from "@/assets/logo-full.png";
import {
  ARABIC_PRINT_BASE_CSS,
  ARABIC_PRINT_FONT_LINKS,
  ARABIC_PRINT_ONLOAD_SCRIPT,
  openArabicPrintHtml,
} from "@/lib/arabic-print-document";
import { BRAND } from "@/lib/brand";
import type { DatePeriod } from "@/lib/date-period-filter";

export type RegistryPrintRow = {
  occurredAt: string;
  sourceLabel: string;
  partyLabel: string;
  amount: number;
  detail?: string | null;
  receiptRef?: string | null;
};

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

function periodLabel(period: DatePeriod, customFrom: string, customTo: string) {
  if (period === "today") return "يومي — اليوم";
  if (period === "week") return "أسبوعي — آخر 7 أيام";
  if (period === "custom") {
    if (customFrom && customTo) return `مخصص — ${customFrom} → ${customTo}`;
    return "مخصص";
  }
  return "الكل";
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

export async function openCollectionRegistryStatementPrint(opts: {
  title?: string;
  period: DatePeriod;
  customFrom: string;
  customTo: string;
  sourceFilterLabel: string;
  partyFilterLabel: string;
  rows: RegistryPrintRow[];
  subtotals: { label: string; amount: number }[];
  grandTotal: number;
  printedBy?: string | null;
}) {
  const logo = await logoDataUrl();
  const title = opts.title || "كشف توريدات — مركز التحصيل";

  const rowsHtml = opts.rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(fmtDate(r.occurredAt))}</td>
        <td>${escapeHtml(r.sourceLabel)}</td>
        <td>${escapeHtml(r.partyLabel)}</td>
        <td>${escapeHtml(r.detail || "—")}</td>
        <td style="text-align:left;font-weight:600">${escapeHtml(money(r.amount))}</td>
      </tr>`,
    )
    .join("");

  const subHtml = opts.subtotals
    .map(
      (s) =>
        `<div class="sub"><span>${escapeHtml(s.label)}</span><strong>${escapeHtml(money(s.amount))}</strong></div>`,
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
    .subs { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 10px 24px; font-size: 13px; }
    .sub { display: flex; gap: 8px; }
    .grand { margin-top: 10px; font-size: 16px; font-weight: 800; color: #0A0A0A; }
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
      <div><strong>الفترة:</strong> ${escapeHtml(periodLabel(opts.period, opts.customFrom, opts.customTo))}</div>
      <div><strong>جهة التوريد:</strong> ${escapeHtml(opts.sourceFilterLabel)}</div>
      <div><strong>الطرف:</strong> ${escapeHtml(opts.partyFilterLabel)}</div>
      ${opts.printedBy ? `<div><strong>طباعة بواسطة:</strong> ${escapeHtml(opts.printedBy)}</div>` : ""}
      <div><strong>عدد العمليات:</strong> ${opts.rows.length}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>جهة التوريد</th>
          <th>الطرف</th>
          <th>تفاصيل</th>
          <th>المبلغ</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="5" style="text-align:center;color:#6b7280">لا توجد عمليات</td></tr>`}
      </tbody>
    </table>
    <div class="subs">${subHtml}</div>
    <div class="grand">الإجمالي: ${escapeHtml(money(opts.grandTotal))}</div>
    <div class="foot">${escapeHtml(BRAND.fullNameAr)} — للمطابقة والتدقيق الداخلي</div>
  </div>
  ${ARABIC_PRINT_ONLOAD_SCRIPT}
</body>
</html>`;

  openArabicPrintHtml(html);
}
