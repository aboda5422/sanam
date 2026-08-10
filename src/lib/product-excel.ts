import * as XLSX from "xlsx";

/** Canonical headers matching the product admin form fields */
export const PRODUCT_EXCEL_HEADERS = [
  "اسم المنتج *",
  "الاسم بالإنجليزية",
  "القسم *",
  "السعر *",
  "السعر قبل الخصم",
  "سعر التكلفة",
  "المخزون",
  "الوحدة",
  "الباركود",
  "الوصف",
  "رابط الصورة",
  "مفعّل",
  "مميز",
] as const;

export type ProductExcelHeader = (typeof PRODUCT_EXCEL_HEADERS)[number];

export type CategoryOption = {
  id: string;
  name: string;
  name_en?: string | null;
  is_active?: boolean;
};

export type ParsedProductRow = {
  rowNumber: number;
  name: string;
  name_en: string | null;
  category_id: string;
  category_name: string;
  price: number;
  original_price: number | null;
  cost_price: number | null;
  stock_quantity: number;
  unit: string;
  barcode: string | null;
  description: string | null;
  image: string | null;
  is_active: boolean;
  is_featured: boolean;
};

export type ImportError = {
  row: number;
  field: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; products: ParsedProductRow[] }
  | { ok: false; errors: ImportError[] };

const YES = new Set(["نعم", "yes", "true", "1", "y", "مفعل", "مفعّل"]);
const NO = new Set(["لا", "no", "false", "0", "n"]);

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function parseYesNo(v: unknown, defaultValue: boolean): boolean | null {
  const s = cellStr(v);
  if (!s) return defaultValue;
  const lower = s.toLowerCase();
  if (YES.has(s) || YES.has(lower)) return true;
  if (NO.has(s) || NO.has(lower)) return false;
  return null;
}

function parseNumber(v: unknown): number | null {
  const s = cellStr(v).replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function isEmptyRow(row: Record<string, unknown>): boolean {
  return PRODUCT_EXCEL_HEADERS.every((h) => !cellStr(row[h]));
}

/** Build and download a fresh Excel template from live categories + product fields */
export function downloadProductsTemplate(categories: CategoryOption[]) {
  const active = categories.filter((c) => c.is_active !== false);
  const categoryNames = active.map((c) => c.name);

  const productsAoA: unknown[][] = [
    [...PRODUCT_EXCEL_HEADERS],
    [
      "تفاح أحمر",
      "Red Apple",
      categoryNames[0] || "",
      12.5,
      15,
      8,
      100,
      "كيلو",
      "6281007012345",
      "مثال توضيحي — احذف هذا الصف أو استبدله",
      "",
      "نعم",
      "لا",
    ],
  ];

  // Pre-fill defaults for empty template rows guidance (header + example only)
  const productsSheet = XLSX.utils.aoa_to_sheet(productsAoA);
  productsSheet["!cols"] = [
    { wch: 28 }, { wch: 24 }, { wch: 26 }, { wch: 12 }, { wch: 16 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 32 },
    { wch: 36 }, { wch: 10 }, { wch: 10 },
  ];

  const catsAoA: unknown[][] = [
    ["اسم القسم (استخدمه في عمود القسم)", "الاسم بالإنجليزية", "الحالة"],
    ...active.map((c) => [c.name, c.name_en || "", "مفعّل"]),
  ];
  const catsSheet = XLSX.utils.aoa_to_sheet(catsAoA);
  catsSheet["!cols"] = [{ wch: 40 }, { wch: 28 }, { wch: 12 }];

  const helpAoA: unknown[][] = [
    ["نموذج رفع المنتجات — سنام"],
    [""],
    ["تم توليد هذا الملف تلقائيًا من الأقسام والحقول الحالية في بطاقة المنتج."],
    [""],
    ["الحقول المطلوبة: اسم المنتج * | القسم * | السعر *"],
    ["القسم يجب أن يطابق اسمًا من ورقة «الأقسام» حرفيًا."],
    ["مفعّل / مميز: نعم أو لا"],
    ["سعر التكلفة والمخزون للإدارة فقط ولا يظهران للعملاء."],
    ["لا تغيّر عناوين الصف الأول ولا تضف أعمدة جديدة."],
  ];
  const helpSheet = XLSX.utils.aoa_to_sheet(helpAoA);
  helpSheet["!cols"] = [{ wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, productsSheet, "المنتجات");
  XLSX.utils.book_append_sheet(wb, catsSheet, "الأقسام");
  XLSX.utils.book_append_sheet(wb, helpSheet, "تعليمات");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `نموذج_رفع_المنتجات_${stamp}.xlsx`);

  return { categoriesCount: active.length, fieldsCount: PRODUCT_EXCEL_HEADERS.length };
}

function normalizeHeader(h: string): string {
  return h.replace(/\s+/g, " ").trim();
}

/** Parse + strictly validate an uploaded Excel against live categories and headers */
export async function parseAndValidateProductsFile(
  file: File,
  categories: CategoryOption[],
): Promise<ValidationResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const sheetName =
    wb.SheetNames.find((n) => n.includes("منتج")) || wb.SheetNames[0];
  if (!sheetName) {
    return { ok: false, errors: [{ row: 0, field: "الملف", message: "الملف فارغ أو لا يحتوي على أوراق" }] };
  }

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (!rows.length) {
    return { ok: false, errors: [{ row: 0, field: "الملف", message: "لا توجد صفوف منتجات في الملف" }] };
  }

  // Validate headers from first data object's keys / sheet range
  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false })[0] as string[] | undefined;
  if (!headerRow?.length) {
    return { ok: false, errors: [{ row: 1, field: "العناوين", message: "صف العناوين مفقود" }] };
  }

  const normalizedHeaders = headerRow.map((h) => normalizeHeader(String(h ?? "")));
  const errors: ImportError[] = [];

  // Strict: every required template header must exist
  for (const required of PRODUCT_EXCEL_HEADERS) {
    if (!normalizedHeaders.includes(required)) {
      errors.push({
        row: 1,
        field: required,
        message: `عمود مطلوب مفقود: «${required}»`,
      });
    }
  }

  // Strict: no unexpected columns (ignore empty trailing headers)
  const allowed = new Set<string>(PRODUCT_EXCEL_HEADERS);
  for (const h of normalizedHeaders) {
    if (!h) continue;
    if (!allowed.has(h)) {
      errors.push({
        row: 1,
        field: h,
        message: `عمود غير معروف: «${h}» — استخدم نموذج الموقع فقط`,
      });
    }
  }

  if (errors.length) return { ok: false, errors };

  const activeCats = categories.filter((c) => c.is_active !== false);
  const byName = new Map(activeCats.map((c) => [c.name.trim(), c]));
  // Also allow inactive names with a clear error later if matched inactive
  const allByName = new Map(categories.map((c) => [c.name.trim(), c]));

  const products: ParsedProductRow[] = [];

  rows.forEach((raw, idx) => {
    // Rebuild row with normalized keys
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      row[normalizeHeader(k)] = v;
    }

    const excelRow = idx + 2; // header is row 1
    if (isEmptyRow(row)) return;

    const name = cellStr(row["اسم المنتج *"]);
    const categoryName = cellStr(row["القسم *"]);
    const priceRaw = parseNumber(row["السعر *"]);
    const originalRaw = parseNumber(row["السعر قبل الخصم"]);
    const costRaw = parseNumber(row["سعر التكلفة"]);
    const stockRaw = parseNumber(row["المخزون"]);
    const unit = cellStr(row["الوحدة"]) || "قطعة";
    const barcode = cellStr(row["الباركود"]);
    const description = cellStr(row["الوصف"]);
    const image = cellStr(row["رابط الصورة"]);
    const nameEn = cellStr(row["الاسم بالإنجليزية"]);
    const activeVal = parseYesNo(row["مفعّل"], true);
    const featuredVal = parseYesNo(row["مميز"], false);

    if (!name) {
      errors.push({ row: excelRow, field: "اسم المنتج *", message: "اسم المنتج مطلوب" });
    }
    if (!categoryName) {
      errors.push({ row: excelRow, field: "القسم *", message: "القسم مطلوب" });
    } else {
      const cat = byName.get(categoryName);
      if (!cat) {
        const inactive = allByName.get(categoryName);
        if (inactive && inactive.is_active === false) {
          errors.push({
            row: excelRow,
            field: "القسم *",
            message: `القسم «${categoryName}» موجود لكنه غير مفعّل`,
          });
        } else {
          errors.push({
            row: excelRow,
            field: "القسم *",
            message: `القسم «${categoryName}» غير موجود في أقسام الموقع`,
          });
        }
      }
    }

    if (priceRaw === null) {
      errors.push({ row: excelRow, field: "السعر *", message: "السعر مطلوب" });
    } else if (Number.isNaN(priceRaw) || priceRaw < 0) {
      errors.push({ row: excelRow, field: "السعر *", message: "السعر يجب أن يكون رقمًا صحيحًا ≥ 0" });
    }

    if (originalRaw !== null && Number.isNaN(originalRaw)) {
      errors.push({ row: excelRow, field: "السعر قبل الخصم", message: "قيمة غير رقمية" });
    } else if (originalRaw !== null && originalRaw < 0) {
      errors.push({ row: excelRow, field: "السعر قبل الخصم", message: "لا يمكن أن يكون سالبًا" });
    }

    if (costRaw !== null && Number.isNaN(costRaw)) {
      errors.push({ row: excelRow, field: "سعر التكلفة", message: "قيمة غير رقمية" });
    } else if (costRaw !== null && costRaw < 0) {
      errors.push({ row: excelRow, field: "سعر التكلفة", message: "لا يمكن أن يكون سالبًا" });
    }

    if (stockRaw !== null && (Number.isNaN(stockRaw) || stockRaw < 0 || Math.floor(stockRaw) !== stockRaw)) {
      errors.push({ row: excelRow, field: "المخزون", message: "المخزون يجب أن يكون عددًا صحيحًا ≥ 0" });
    }

    if (activeVal === null) {
      errors.push({ row: excelRow, field: "مفعّل", message: "القيمة يجب أن تكون نعم أو لا" });
    }
    if (featuredVal === null) {
      errors.push({ row: excelRow, field: "مميز", message: "القيمة يجب أن تكون نعم أو لا" });
    }

    const cat = byName.get(categoryName);
    if (
      name &&
      cat &&
      priceRaw !== null &&
      !Number.isNaN(priceRaw) &&
      priceRaw >= 0 &&
      activeVal !== null &&
      featuredVal !== null &&
      (originalRaw === null || (!Number.isNaN(originalRaw) && originalRaw >= 0)) &&
      (costRaw === null || (!Number.isNaN(costRaw) && costRaw >= 0)) &&
      (stockRaw === null || (!Number.isNaN(stockRaw) && stockRaw >= 0 && Math.floor(stockRaw) === stockRaw))
    ) {
      products.push({
        rowNumber: excelRow,
        name,
        name_en: nameEn || null,
        category_id: cat.id,
        category_name: categoryName,
        price: priceRaw,
        original_price: originalRaw,
        cost_price: costRaw,
        stock_quantity: stockRaw ?? 0,
        unit,
        barcode: barcode || null,
        description: description || null,
        image: image || null,
        is_active: activeVal,
        is_featured: featuredVal,
      });
    }
  });

  if (errors.length) return { ok: false, errors };
  if (!products.length) {
    return { ok: false, errors: [{ row: 0, field: "الملف", message: "لا توجد منتجات صالحة للإدراج" }] };
  }
  return { ok: true, products };
}

export function toInsertPayload(p: ParsedProductRow) {
  return {
    name: p.name,
    name_en: p.name_en,
    price: p.price,
    original_price: p.original_price,
    cost_price: p.cost_price,
    stock_quantity: p.stock_quantity,
    image: p.image,
    unit: p.unit,
    description: p.description,
    barcode: p.barcode,
    category_id: p.category_id,
    is_active: p.is_active,
    is_featured: p.is_featured,
  };
}
