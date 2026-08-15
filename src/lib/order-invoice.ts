import logoFull from "@/assets/logo-full.png";
import { BRAND } from "@/lib/brand";
import { splitInclusiveVat } from "@/lib/vat";

const VAT_NUMBER_PLACEHOLDER = "000000000000000";

type InvoiceItem = {
  product_name?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
};

export type InvoiceOrder = {
  order_number?: number;
  created_at?: string;
  delivered_at?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  payment_method?: string | null;
  subtotal?: number;
  delivery_fee?: number;
  discount_amount?: number;
  discount_percent?: number;
  total?: number;
  order_items?: InvoiceItem[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number) {
  return Number(n || 0).toFixed(2);
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

export async function openOrderInvoice(order: InvoiceOrder) {
  const logo = await logoDataUrl();
  const items = order.order_items || [];
  const subtotal = Number(order.subtotal || 0);
  const delivery = Number(order.delivery_fee || 0);
  const discount = Number(order.discount_amount || 0);
  const total = Number(order.total || 0);
  const { exclusive, vat } = splitInclusiveVat(subtotal);
  const pay =
    order.payment_method === "cash" ? "نقداً عند الاستلام" : "إلكتروني";
  const issued = new Date(order.delivered_at || order.created_at || Date.now()).toLocaleString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const rows = items
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.product_name || "")}</td>
        <td>${item.quantity ?? 1}</td>
        <td>${money(Number(item.unit_price || 0))}</td>
        <td>${money(Number(item.total_price || 0))}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>فاتورة طلب ${order.order_number ?? ""}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #1f2937; margin: 0; background: #fff; }
    .wrap { max-width: 800px; margin: 0 auto; padding: 24px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #EC8824; padding-bottom: 16px; }
    .head img { height: 56px; }
    .legal { text-align: left; font-size: 13px; line-height: 1.7; }
    h1 { margin: 18px 0 6px; font-size: 22px; color: #EC8824; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; margin: 16px 0 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: right; }
    th { background: #fff7ed; }
    .totals { width: 280px; margin-right: auto; margin-top: 16px; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
    .totals .grand { font-weight: 800; font-size: 16px; color: #EC8824; border-bottom: none; padding-top: 10px; }
    .foot { margin-top: 28px; font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    .actions { margin-bottom: 16px; }
    .actions button { background: #EC8824; color: #fff; border: 0; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
    @media print { .actions { display: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="actions"><button onclick="window.print()">حفظ / طباعة PDF</button></div>
    <div class="head">
      <img src="${logo}" alt="${escapeHtml(BRAND.fullNameAr)}" />
      <div class="legal">
        <strong>${escapeHtml(BRAND.legalNameAr)}</strong><br/>
        ${escapeHtml(BRAND.legalNameEn)}<br/>
        الرقم الضريبي: ${VAT_NUMBER_PLACEHOLDER}<br/>
        السجل التجاري: ${escapeHtml(BRAND.crNumber)}
      </div>
    </div>
    <h1>فاتورة ضريبية مبسطة</h1>
    <div class="meta">
      <div>رقم الطلب: <strong>#${order.order_number ?? ""}</strong></div>
      <div>تاريخ الإصدار: ${escapeHtml(issued)}</div>
      <div>العميل: ${escapeHtml(order.customer_name || "—")}</div>
      <div>الجوال: ${escapeHtml(order.customer_phone || "—")}</div>
      <div style="grid-column:1/-1">عنوان التوصيل: ${escapeHtml(order.delivery_address || "—")}</div>
      <div>طريقة الدفع: ${pay}</div>
    </div>
    <table>
      <thead>
        <tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة (شامل الضريبة)</th><th>الإجمالي</th></tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4">لا توجد أصناف</td></tr>`}</tbody>
    </table>
    <div class="totals">
      <div><span>المجموع قبل الضريبة</span><span>${money(exclusive)} ر.س</span></div>
      <div><span>ضريبة القيمة المضافة 15%</span><span>${money(vat)} ر.س</span></div>
      <div><span>المجموع شامل الضريبة</span><span>${money(subtotal)} ر.س</span></div>
      ${discount > 0 ? `<div><span>خصم${order.discount_percent ? ` (${order.discount_percent}%)` : ""}</span><span>−${money(discount)} ر.س</span></div>` : ""}
      <div><span>رسوم التوصيل</span><span>${money(delivery)} ر.س</span></div>
      <div class="grand"><span>الإجمالي المستحق</span><span>${money(total)} ر.س</span></div>
    </div>
    <div class="foot">
      ${escapeHtml(BRAND.fullNameAr)} — ${escapeHtml(BRAND.phoneDisplay)} — ${escapeHtml(BRAND.siteUrl)}
    </div>
  </div>
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) throw new Error("popup-blocked");
  win.document.open();
  win.document.write(html);
  win.document.close();
}
