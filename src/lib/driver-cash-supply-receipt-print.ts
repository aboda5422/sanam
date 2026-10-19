import logoFull from "@/assets/logo-full.png";
import {
  ARABIC_PRINT_BASE_CSS,
  ARABIC_PRINT_FONT_LINKS,
  ARABIC_PRINT_ONLOAD_SCRIPT,
  openArabicPrintHtml,
} from "@/lib/arabic-print-document";
import { BRAND } from "@/lib/brand";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(2)} ر.س`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
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

export async function openDriverCashSupplyReceiptPrint(opts: {
  driverName: string;
  driverPhone?: string | null;
  amount: number;
  collectedAt: string;
  channel: "wholesale" | "retail";
  collectorName?: string | null;
  receiptRef?: string | null;
}) {
  const logo = await logoDataUrl();
  const channelLabel = opts.channel === "wholesale" ? "مناديب الجملة" : "المناديب";
  const title = "سند / إيصال توريد نقد — مركز التحصيل";

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  ${ARABIC_PRINT_FONT_LINKS}
  <style>
    ${ARABIC_PRINT_BASE_CSS}
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: #fff; color: #1f2937;
      font-family: "Noto Naskh Arabic", "Segoe UI", Tahoma, Arial, sans-serif;
      line-height: 1.6;
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 24px; }
    .actions { margin-bottom: 14px; }
    .actions button {
      background: #0A0A0A; color: #fff; border: 0; padding: 9px 16px;
      border-radius: 8px; cursor: pointer; font: inherit;
    }
    .head {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px; border-bottom: 3px solid #0A0A0A; padding-bottom: 14px;
    }
    .head img { height: 64px; width: 64px; object-fit: cover; border-radius: 12px; }
    .brand h1 { margin: 0; font-size: 22px; color: #0A0A0A; }
    .brand p { margin: 4px 0 0; font-size: 13px; color: #6b7280; }
    h2 { margin: 20px 0 12px; font-size: 20px; color: #0A0A0A; text-align: center; }
    .box {
      border: 1.5px solid #0A0A0A; border-radius: 12px; padding: 16px 18px;
      background: #fafafa; font-size: 14px;
    }
    .box div + div { margin-top: 8px; }
    .amount {
      margin-top: 16px; text-align: center; font-size: 22px; font-weight: 800;
      color: #0A0A0A; padding: 12px; border: 2px dashed #0A0A0A; border-radius: 10px;
    }
    .foot {
      margin-top: 28px; padding-top: 12px; border-top: 1px solid #e5e7eb;
      font-size: 11px; color: #6b7280; text-align: center;
    }
    @media print { .actions { display: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="actions"><button type="button" onclick="window.print()">حفظ / طباعة PDF</button></div>
    <div class="head">
      <div class="brand">
        <img src="${logo}" alt="${escapeHtml(BRAND.fullNameAr)}" />
        <h1>${escapeHtml(BRAND.fullNameAr)}</h1>
        <p>${escapeHtml(BRAND.taglineAr)}</p>
      </div>
      <div style="font-size:12px;text-align:left;line-height:1.7;">
        <strong>${escapeHtml(BRAND.legalNameAr)}</strong><br/>
        السجل التجاري: ${escapeHtml(BRAND.crNumber)}<br/>
        ${escapeHtml(BRAND.phoneDisplay)}
      </div>
    </div>
    <h2>${escapeHtml(title)}</h2>
    <div class="box">
      <div><strong>المسار:</strong> ${escapeHtml(channelLabel)}</div>
      <div><strong>المندوب:</strong> ${escapeHtml(opts.driverName)}</div>
      ${opts.driverPhone ? `<div><strong>الجوال:</strong> ${escapeHtml(opts.driverPhone)}</div>` : ""}
      <div><strong>تاريخ التوريد:</strong> ${escapeHtml(fmtDate(opts.collectedAt))}</div>
      ${opts.collectorName ? `<div><strong>المحصّل:</strong> ${escapeHtml(opts.collectorName)}</div>` : ""}
      ${opts.receiptRef ? `<div><strong>مرجع العملية:</strong> ${escapeHtml(opts.receiptRef)}</div>` : ""}
    </div>
    <div class="amount">المبلغ المُورَّد للمحصل: ${escapeHtml(money(opts.amount))}</div>
    <p style="text-align:center;font-size:13px;color:#6b7280;margin-top:16px;">
      يُسلَّم للمندوب نسخة من هذا السند بعد استلام النقد في مركز التحصيل.
    </p>
    <div class="foot">
      ${escapeHtml(BRAND.fullNameAr)} — ${escapeHtml(BRAND.siteUrl)}
    </div>
  </div>
  ${ARABIC_PRINT_ONLOAD_SCRIPT}
</body>
</html>`;

  openArabicPrintHtml(html);
}
