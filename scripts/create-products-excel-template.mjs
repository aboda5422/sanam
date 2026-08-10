import ExcelJS from "exceljs";
import { writeFileSync } from "fs";
import { resolve } from "path";

const SUPABASE_URL = "https://vttfmqxteblesiwtfkkc.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function fetchCategories() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/categories?select=id,name,name_en,slug,is_active,sort_order&order=sort_order`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`);
  return res.json();
}

async function main() {
  const categories = await fetchCategories();
  const activeCategories = categories.filter((c) => c.is_active);
  const categoryNames = activeCategories.map((c) => c.name);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "سنام";
  workbook.created = new Date();

  // ===== Sheet 1: المنتجات =====
  const productsSheet = workbook.addWorksheet("المنتجات", {
    views: [{ rightToLeft: true }],
  });

  const headers = [
    { key: "name", header: "اسم المنتج *", width: 30 },
    { key: "name_en", header: "الاسم بالإنجليزية", width: 28 },
    { key: "category", header: "القسم *", width: 28 },
    { key: "price", header: "السعر *", width: 12 },
    { key: "original_price", header: "السعر قبل الخصم", width: 16 },
    { key: "cost_price", header: "سعر التكلفة", width: 14 },
    { key: "stock_quantity", header: "المخزون", width: 12 },
    { key: "unit", header: "الوحدة", width: 12 },
    { key: "barcode", header: "الباركود", width: 18 },
    { key: "description", header: "الوصف", width: 35 },
    { key: "image", header: "رابط الصورة", width: 40 },
    { key: "is_active", header: "مفعّل", width: 10 },
    { key: "is_featured", header: "مميز", width: 10 },
  ];

  productsSheet.columns = headers.map((h) => ({
    header: h.header,
    key: h.key,
    width: h.width,
  }));

  // Style header row
  const headerRow = productsSheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1B7A4E" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0F5132" } },
      bottom: { style: "thin", color: { argb: "FF0F5132" } },
      left: { style: "thin", color: { argb: "FF0F5132" } },
      right: { style: "thin", color: { argb: "FF0F5132" } },
    };
  });

  // Example rows (2 samples) so the client understands the format
  const examples = [
    {
      name: "تفاح أحمر",
      name_en: "Red Apple",
      category: categoryNames.includes("الخضار والفواكه")
        ? "الخضار والفواكه"
        : categoryNames[0] || "",
      price: 12.5,
      original_price: 15,
      cost_price: 8,
      stock_quantity: 100,
      unit: "كيلو",
      barcode: "6281007012345",
      description: "تفاح طازج عالي الجودة",
      image: "",
      is_active: "نعم",
      is_featured: "لا",
    },
    {
      name: "حليب كامل الدسم",
      name_en: "Full Fat Milk",
      category: categoryNames.includes("الحليب")
        ? "الحليب"
        : categoryNames[1] || categoryNames[0] || "",
      price: 6.5,
      original_price: "",
      cost_price: 4.2,
      stock_quantity: 50,
      unit: "لتر",
      barcode: "",
      description: "",
      image: "",
      is_active: "نعم",
      is_featured: "نعم",
    },
  ];

  examples.forEach((ex) => {
    const row = productsSheet.addRow(ex);
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD0D0D0" } },
        bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
        left: { style: "thin", color: { argb: "FFD0D0D0" } },
        right: { style: "thin", color: { argb: "FFD0D0D0" } },
      };
    });
  });

  // Light yellow for example rows so user knows to replace them
  for (let r = 2; r <= 3; r++) {
    productsSheet.getRow(r).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF8E1" },
      };
    });
  }

  // Pre-format empty rows for data entry (rows 4–503)
  for (let r = 4; r <= 503; r++) {
    const row = productsSheet.getRow(r);
    row.values = {
      unit: "قطعة",
      is_active: "نعم",
      is_featured: "لا",
      stock_quantity: 0,
    };
    // Ensure defaults are set via cells
    row.getCell("unit").value = "قطعة";
    row.getCell("is_active").value = "نعم";
    row.getCell("is_featured").value = "لا";
    row.getCell("stock_quantity").value = 0;
  }

  // Data validation: category dropdown (column C = 3)
  // Reference the categories list sheet range
  productsSheet.dataValidations.add("C2:C503", {
    type: "list",
    allowBlank: false,
    formulae: ["=الأقسام!$A$2:$A$" + (activeCategories.length + 1)],
    showErrorMessage: true,
    errorTitle: "قسم غير صحيح",
    error: "اختر القسم من القائمة المنسدلة فقط",
  });

  // Yes/No for is_active (L) and is_featured (M)
  productsSheet.dataValidations.add("L2:L503", {
    type: "list",
    allowBlank: true,
    formulae: ['"نعم,لا"'],
  });
  productsSheet.dataValidations.add("M2:M503", {
    type: "list",
    allowBlank: true,
    formulae: ['"نعم,لا"'],
  });

  // Freeze header
  productsSheet.views = [{ state: "frozen", ySplit: 1, rightToLeft: true }];

  // ===== Sheet 2: الأقسام =====
  const catsSheet = workbook.addWorksheet("الأقسام", {
    views: [{ rightToLeft: true }],
  });
  catsSheet.columns = [
    { header: "اسم القسم (استخدمه في عمود القسم)", key: "name", width: 40 },
    { header: "الاسم بالإنجليزية", key: "name_en", width: 30 },
    { header: "الحالة", key: "status", width: 12 },
    { header: "الترتيب", key: "sort_order", width: 10 },
  ];

  const catsHeader = catsSheet.getRow(1);
  catsHeader.height = 26;
  catsHeader.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1565C0" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  activeCategories.forEach((c) => {
    catsSheet.addRow({
      name: c.name,
      name_en: c.name_en || "",
      status: "مفعّل",
      sort_order: c.sort_order,
    });
  });

  // Also list inactive at the bottom for reference (not in dropdown)
  const inactive = categories.filter((c) => !c.is_active);
  if (inactive.length) {
    catsSheet.addRow({});
    const noteRow = catsSheet.addRow({
      name: "—— أقسام غير مفعّلة (للمرجع فقط — غير متاحة في القائمة) ——",
    });
    noteRow.getCell(1).font = { italic: true, color: { argb: "FF999999" } };
    inactive.forEach((c) => {
      const row = catsSheet.addRow({
        name: c.name,
        name_en: c.name_en || "",
        status: "معطّل",
        sort_order: c.sort_order,
      });
      row.eachCell((cell) => {
        cell.font = { color: { argb: "FF999999" } };
      });
    });
  }

  // ===== Sheet 3: تعليمات =====
  const helpSheet = workbook.addWorksheet("تعليمات", {
    views: [{ rightToLeft: true }],
  });
  helpSheet.getColumn(1).width = 90;

  const instructions = [
    "نموذج رفع المنتجات — سنام",
    "",
    "كيف تستخدم الملف:",
    "1) اذهب إلى ورقة «المنتجات» واملأ صفًا لكل منتج.",
    "2) الصفان الأصفران مثالان توضيحيان — يمكنك حذفهما أو استبدالهما.",
    "3) عمود «القسم *» فيه قائمة منسدلة بأسماء الأقسام المفعّلة — اختر منها فقط.",
    "4) راجع ورقة «الأقسام» لمعرفة الأسماء الصحيحة للأقسام.",
    "",
    "الحقول المطلوبة (علامة *):",
    "• اسم المنتج *",
    "• القسم *",
    "• السعر *",
    "",
    "الحقول الاختيارية:",
    "• الاسم بالإنجليزية",
    "• السعر قبل الخصم (إن وُجد عرض)",
    "• سعر التكلفة (للإدارة فقط — لا يظهر للعملاء)",
    "• المخزون (للإدارة فقط — لا يظهر للعملاء)",
    "• الوحدة (افتراضي: قطعة)",
    "• الباركود",
    "• الوصف",
    "• رابط الصورة (رابط مباشر للصورة إن وُجد)",
    "• مفعّل: نعم / لا (افتراضي: نعم)",
    "• مميز: نعم / لا (افتراضي: لا)",
    "",
    "ملاحظات مهمة:",
    "• لا تغيّر عناوين الأعمدة في الصف الأول.",
    "• لا تضف أعمدة جديدة.",
    "• السعر وسعر التكلفة والمخزون أرقام فقط.",
    "• بعد تعبئة الملف أرسله لنا لرفعه إلى النظام.",
  ];

  instructions.forEach((text, i) => {
    const row = helpSheet.addRow([text]);
    if (i === 0) {
      row.getCell(1).font = { bold: true, size: 16, color: { argb: "FF1B7A4E" } };
    } else if (
      text.startsWith("كيف") ||
      text.startsWith("الحقول") ||
      text.startsWith("ملاحظات")
    ) {
      row.getCell(1).font = { bold: true, size: 12, color: { argb: "FF1565C0" } };
    } else {
      row.getCell(1).font = { size: 11 };
    }
    row.height = text === "" ? 10 : 20;
  });

  const outPath = resolve("نموذج_رفع_المنتجات.xlsx");
  await workbook.xlsx.writeFile(outPath);
  console.log("Created:", outPath);
  console.log("Active categories:", activeCategories.length);
  console.log("Total categories:", categories.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
