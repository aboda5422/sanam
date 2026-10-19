import * as XLSX from "xlsx";
import { format } from "date-fns";
import { BRAND } from "@/lib/brand";

const COLS = 10;

export type SalesExcelStats = {
  totalRevenue: number;
  totalDeliveryFees: number;
  driverDeliveryShare: number;
  appDeliveryShare: number;
  disbursed: number;
  wageDisbursed: number;
  salaryDisbursed: number;
  balance: number;
  electronicTotal: number;
  transferTotal: number;
  driverCashCollected: number;
  driverCashPending: number;
  totalCouponDiscount: number;
  cashOnHand: number;
  totalOrders: number;
  deliveredCount: number;
  cashOrderCount: number;
  electronicOrderCount: number;
  transferOrders: number;
};

export type SalesExcelMovement = {
  at: string;
  kind: "دخل" | "خرج";
  description: string;
  orderNumber: string;
  customer: string;
  driver: string;
  income: number;
  expense: number;
  payMethod: string;
  status: string;
};

export type SalesExcelInput = {
  periodLabel: string;
  from: Date;
  to: Date;
  exportedAt?: Date;
  stats: SalesExcelStats;
  movements: SalesExcelMovement[];
};

type Row = (string | number)[];

function blank(): Row {
  return [""];
}

function title(text: string): Row {
  return [text];
}

function indicator(label: string, value: number | string, hint: string): Row {
  return [label, value, hint];
}

export function buildSalesExcelRows(input: SalesExcelInput) {
  const exportedAt = input.exportedAt ?? new Date();
  const period = `${input.periodLabel} — من ${format(input.from, "yyyy/MM/dd")} إلى ${format(input.to, "yyyy/MM/dd")}`;
  const rows: Row[] = [
    title(BRAND.nameAr),
    title(`${BRAND.legalNameAr} — سجل ${BRAND.crNumber}`),
    title("تقرير الحسابات والمبيعات"),
    title(period),
    title(`تاريخ التصدير: ${format(exportedAt, "yyyy/MM/dd HH:mm")} — ${BRAND.siteUrl}`),
    title("المبالغ بالريال السعودي. المؤشرات في الأعلى هي نفس بطاقات الشاشة للطلبات المكتملة."),
    blank(),
    title("المؤشرات"),
    blank(),
    title("النتيجة — ماذا دخل وماذا خرج"),
    ["المؤشر", "المبلغ", "ببساطة"],
    indicator("إجمالي الإيرادات", input.stats.totalRevenue, "ما دفعه العملاء في الطلبات المكتملة"),
    indicator("رسوم التوصيل", input.stats.totalDeliveryFees, "جزء من قيمة الطلب"),
    indicator("منها للمناديب", input.stats.driverDeliveryShare, "حصة المندوب من رسوم التوصيل"),
    indicator("منها للتطبيق", input.stats.appDeliveryShare, "ما يبقى للتطبيق من رسوم التوصيل"),
    indicator("إجمالي المنصرف", input.stats.disbursed, "ما خرج فعلاً من الحساب"),
    indicator("مصروفات نسب المناديب", input.stats.wageDisbursed, "أجر خُصم عند التسوية"),
    indicator("مصروفات رواتب المناديب", input.stats.salaryDisbursed, "راتب صُرف من تبويب الأجور"),
    indicator("الرصيد", input.stats.balance, "الإيرادات ناقص المنصرف"),
    blank(),
    title("التحصيل والنقد — أين المال الآن"),
    ["المؤشر", "المبلغ", "ببساطة"],
    indicator("دفع إلكتروني", input.stats.electronicTotal, "وصل إلى البنك مع الطلب"),
    indicator("تحويل بنكي", input.stats.transferTotal, "تحويل من العميل"),
    indicator("نقد محصّل من المناديب", input.stats.driverCashCollected, "ما سلّمه المندوب بعد خصم أجره"),
    indicator("نقد بانتظار التحصيل", input.stats.driverCashPending, "ما زال مع المندوب"),
    indicator("خصومات القسائم", input.stats.totalCouponDiscount, "مخصومة أصلاً من الإيراد"),
    indicator("الرصيد الحالي", input.stats.cashOnHand, "ما وصل للبنك وللمحصل بعد خصم الرواتب"),
    blank(),
    title("الطلبات"),
    ["المؤشر", "العدد", "ببساطة"],
    indicator("إجمالي الطلبات", input.stats.totalOrders, "كل الطلبات في الفترة"),
    indicator("الطلبات المكتملة", input.stats.deliveredCount, "سُلّمت ودخلت في الإيراد"),
    indicator("طلبات كاش", input.stats.cashOrderCount, "دفع نقدي"),
    indicator("طلبات دفع إلكتروني", input.stats.electronicOrderCount, "بطاقة أو محفظة"),
    indicator("طلبات تحويل", input.stats.transferOrders, "تحويل بنكي"),
    blank(),
    title("الحركات — كل عملية ظاهرة في الشاشة بعد الفلتر"),
    ["التاريخ", "الحركة", "البيان", "رقم الطلب", "العميل", "المندوب", "دخل", "خرج", "طريقة الدفع", "الحالة"],
  ];

  const movementHeaderIndex = rows.length - 1;
  if (input.movements.length === 0) {
    rows.push(title("لا حركات في هذه الفترة"));
  } else {
    for (const move of input.movements) {
      rows.push([
        format(new Date(move.at), "yyyy/MM/dd HH:mm"),
        move.kind,
        move.description,
        move.orderNumber,
        move.customer,
        move.driver,
        move.income,
        move.expense,
        move.payMethod,
        move.status,
      ]);
    }
    const income = round2(input.movements.reduce((sum, move) => sum + move.income, 0));
    const expense = round2(input.movements.reduce((sum, move) => sum + move.expense, 0));
    rows.push(blank());
    rows.push(["مجموع الدخل في الجدول", income]);
    rows.push(["مجموع الخرج في الجدول", expense]);
    rows.push(["الفرق (الدخل ناقص الخرج)", round2(income - expense)]);
  }

  rows.push(blank());
  rows.push(title(BRAND.copyrightAr));
  return { rows, movementHeaderIndex };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function buildSalesWorkbook(input: SalesExcelInput) {
  const { rows } = buildSalesExcelRows(input);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 28 },
    { wch: 16 },
    { wch: 42 },
    { wch: 16 },
    { wch: 22 },
    { wch: 20 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
  ];
  const merges: XLSX.Range[] = [];
  rows.forEach((row, index) => {
    const onlyTitle = row.length === 1 && typeof row[0] === "string" && row[0] !== "";
    if (onlyTitle) merges.push({ s: { r: index, c: 0 }, e: { r: index, c: COLS - 1 } });
  });
  sheet["!merges"] = merges;
  sheet["!views"] = [{ rightToLeft: true }];

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (typeof rows[r][c] !== "number") continue;
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.z = "#,##0.00";
    }
  }

  const book = XLSX.utils.book_new();
  book.Props = {
    Title: "الحسابات والمبيعات — سنام",
    Subject: "تقرير الحسابات للفترة المحددة",
    Author: BRAND.legalNameAr,
    Company: BRAND.legalNameAr,
  };
  XLSX.utils.book_append_sheet(book, sheet, "الحسابات");
  return book;
}

export function downloadSalesExcel(input: SalesExcelInput) {
  const book = buildSalesWorkbook(input);
  const stamp = format(input.to, "yyyy-MM-dd");
  XLSX.writeFile(book, `حسابات_جب_لي_${stamp}.xlsx`);
}
