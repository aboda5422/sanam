/** Popular external POS / ERP systems for supermarket sync (KSA & regional). */

export type PosIntegrationStatus = "available" | "beta" | "coming_soon";

export type PosConnectField = {
  id: string;
  labelAr: string;
  placeholder: string;
  /** password-style input */
  secret?: boolean;
  helpAr?: string;
  required?: boolean;
};

export type PosConnectStep = {
  titleAr: string;
  bodyAr: string;
};

export type PosIntegrationProvider = {
  id: string;
  nameAr: string;
  nameEn: string;
  category: "pos" | "erp" | "accounting" | "invoicing";
  status: PosIntegrationStatus;
  descriptionAr: string;
  scopes: string[];
  website?: string;
  docsUrl?: string;
  /** How credentials flow */
  connectMode: "outbound" | "inbound" | "both";
  /** Summary shown under the ! icon */
  howItWorksAr: string;
  steps: PosConnectStep[];
  fields: PosConnectField[];
  /** Whether Sanam issues a key for the partner to paste */
  issuesSanamKey: boolean;
};

export const POS_INTEGRATION_PROVIDERS: PosIntegrationProvider[] = [
  {
    id: "odoo",
    nameAr: "أودو (Odoo)",
    nameEn: "Odoo",
    category: "erp",
    status: "available",
    descriptionAr: "مزامنة الأصناف والأسعار والمخزون مع أودو عبر API.",
    scopes: ["products:read", "products:write", "stock:read", "stock:write", "prices:write"],
    website: "https://www.odoo.com",
    docsUrl: "https://www.odoo.com/documentation/17.0/developer/reference/external_api.html",
    connectMode: "outbound",
    howItWorksAr:
      "سنام يتصل بخادم أودو لديك (JSON-RPC). تلصق رابط القاعدة وبيانات مستخدم API، ثم نختبر الاتصال ونفعّل المزامنة.",
    issuesSanamKey: false,
    steps: [
      {
        titleAr: "فعّل External API في أودو",
        bodyAr: "من إعدادات أودو تأكد أن API مفعّل، وأن لديك مستخدماً بصلاحية قراءة/كتابة المنتجات والمخزون.",
      },
      {
        titleAr: "انسخ رابط النظام وقاعدة البيانات",
        bodyAr: "مثال الرابط: https://your-company.odoo.com — واسم قاعدة البيانات كما يظهر عند تسجيل الدخول.",
      },
      {
        titleAr: "أنشئ مفتاح API أو كلمة مرور التطبيق",
        bodyAr: "يفضّل مفتاح API للمستخدم (أو App Password) وليس كلمة مرور الحساب اليومية.",
      },
      {
        titleAr: "الصق البيانات هنا واضغط اختبار الربط",
        bodyAr: "بعد نجاح الاختبار تُحفظ الإعدادات وتُفعَّل المزامنة تلقائياً لهذا النظام.",
      },
    ],
    fields: [
      { id: "base_url", labelAr: "رابط أودو (Base URL)", placeholder: "https://company.odoo.com", required: true, helpAr: "بدون / في النهاية" },
      { id: "database", labelAr: "اسم قاعدة البيانات", placeholder: "company-db", required: true },
      { id: "username", labelAr: "مستخدم API", placeholder: "api@company.com", required: true },
      { id: "api_key", labelAr: "مفتاح API / كلمة مرور التطبيق", placeholder: "••••••••", secret: true, required: true },
    ],
  },
  {
    id: "foodics",
    nameAr: "فودكس (Foodics)",
    nameEn: "Foodics",
    category: "pos",
    status: "beta",
    descriptionAr: "ربط مناسب لفروع لديها كاشير فودكس — مخزون وأسعار.",
    scopes: ["products:read", "stock:read", "prices:read"],
    website: "https://www.foodics.com",
    docsUrl: "https://console.foodics.com",
    connectMode: "outbound",
    howItWorksAr: "تنشئ Access Token من لوحة فودكس وتلصقه هنا. سنام يسحب الأصناف والأسعار والمخزون.",
    issuesSanamKey: false,
    steps: [
      { titleAr: "ادخل لوحة Foodics Console", bodyAr: "من حساب التاجر افتح الإعدادات ثم قسم التكاملات / API." },
      { titleAr: "أنشئ Access Token", bodyAr: "امنح صلاحيات المنتجات والمخزون فقط (Least privilege)." },
      { titleAr: "الصق التوكن واختبر", bodyAr: "بعد النجاح تظهر حالة «متصل» ويمكن جدولة المزامنة." },
    ],
    fields: [
      { id: "access_token", labelAr: "Access Token", placeholder: "ft_…", secret: true, required: true },
      { id: "business_ref", labelAr: "معرّف النشاط (اختياري)", placeholder: "business-id", required: false },
    ],
  },
  {
    id: "loyverse",
    nameAr: "لوايرس (Loyverse)",
    nameEn: "Loyverse",
    category: "pos",
    status: "available",
    descriptionAr: "كاشير شائع للمحلات الصغيرة — مزامنة مخزون وأسعار.",
    scopes: ["products:read", "stock:read", "stock:write", "prices:write"],
    website: "https://loyverse.com",
    docsUrl: "https://developer.loyverse.com",
    connectMode: "outbound",
    howItWorksAr: "من بوابة مطوري Loyverse تنشئ Access Token وتلصقه هنا لبدء المزامنة.",
    issuesSanamKey: false,
    steps: [
      { titleAr: "افتح developer.loyverse.com", bodyAr: "سجّل الدخول بنفس حساب المتجر." },
      { titleAr: "أنشئ Access Token", bodyAr: "اختر صلاحيات Items و Inventory و Prices." },
      { titleAr: "الصق التوكن هنا", bodyAr: "اضغط «اختبار الربط» ثم احفظ." },
    ],
    fields: [
      { id: "access_token", labelAr: "Access Token", placeholder: "…", secret: true, required: true },
    ],
  },
  {
    id: "square",
    nameAr: "سكوير (Square)",
    nameEn: "Square",
    category: "pos",
    status: "coming_soon",
    descriptionAr: "ربط كتالوج وعمليات البيع مع Square POS.",
    scopes: ["products:read", "stock:read", "sales:write"],
    website: "https://squareup.com",
    connectMode: "outbound",
    howItWorksAr: "قريباً: ربط OAuth مع Square بدون نسخ مفاتيح يدوياً.",
    issuesSanamKey: false,
    steps: [
      { titleAr: "قريباً", bodyAr: "سيظهر زر «ربط مع Square» يفتح موافقة OAuth ثم يعود تلقائياً." },
    ],
    fields: [],
  },
  {
    id: "qoyod",
    nameAr: "قيود (Qoyod)",
    nameEn: "Qoyod",
    category: "accounting",
    status: "beta",
    descriptionAr: "ترحيل المبيعات اليومية إلى نظام قيود المحاسبي.",
    scopes: ["sales:read", "invoices:write"],
    website: "https://qoyod.com",
    connectMode: "outbound",
    howItWorksAr: "تلصق مفتاح API من قيود، ونرسل ملخص المبيعات اليومية كقيود محاسبية.",
    issuesSanamKey: false,
    steps: [
      { titleAr: "من قيود → الإعدادات → API", bodyAr: "أنشئ مفتاحاً بصلاحية الفواتير والمبيعات." },
      { titleAr: "الصق المفتاح واختبر", bodyAr: "بعد النجاح تُرحَّل مبيعات الكاشير يومياً." },
    ],
    fields: [
      { id: "api_key", labelAr: "مفتاح API من قيود", placeholder: "…", secret: true, required: true },
    ],
  },
  {
    id: "daftra",
    nameAr: "دفترة (Daftra)",
    nameEn: "Daftra",
    category: "accounting",
    status: "coming_soon",
    descriptionAr: "مزامنة فواتير المبيعات والمخزون مع دفترة.",
    scopes: ["products:read", "sales:read", "invoices:write"],
    website: "https://www.daftra.com",
    connectMode: "outbound",
    howItWorksAr: "قريباً: ربط بمفتاح API من دفترة لمزامنة الفواتير.",
    issuesSanamKey: false,
    steps: [{ titleAr: "قريباً", bodyAr: "سيُتاح إدخال مفتاح دفترة واختبار الاتصال بنفس أسلوب قيود." }],
    fields: [],
  },
  {
    id: "zoho",
    nameAr: "زوهو إنفنتوري",
    nameEn: "Zoho Inventory",
    category: "erp",
    status: "coming_soon",
    descriptionAr: "مزامنة الأصناف والمستويات مع Zoho Inventory.",
    scopes: ["products:read", "stock:read", "stock:write"],
    website: "https://www.zoho.com/inventory",
    connectMode: "outbound",
    howItWorksAr: "قريباً عبر OAuth مع Zoho.",
    issuesSanamKey: false,
    steps: [{ titleAr: "قريباً", bodyAr: "ربط آمن بدون لصق كلمات مرور." }],
    fields: [],
  },
  {
    id: "focus",
    nameAr: "فوكس سوفت (Focus)",
    nameEn: "Focus Softnet",
    category: "erp",
    status: "coming_soon",
    descriptionAr: "تكامل مؤسساتي مع حلول Focus المنتشرة في المنطقة.",
    scopes: ["products:read", "stock:read", "prices:read", "sales:read"],
    connectMode: "both",
    howItWorksAr: "قريباً: إما مفتاح من Focus أو Webhook يستقبل أحداث سنام.",
    issuesSanamKey: true,
    steps: [{ titleAr: "قريباً", bodyAr: "سيظهر معالج إعداد بمساعدة فريق الدعم." }],
    fields: [],
  },
  {
    id: "sap_b1",
    nameAr: "SAP Business One",
    nameEn: "SAP B1",
    category: "erp",
    status: "coming_soon",
    descriptionAr: "للمتاجر الكبرى التي تعتمد SAP كمصدر للحقيقة.",
    scopes: ["products:read", "stock:read", "prices:read"],
    connectMode: "outbound",
    howItWorksAr: "قريباً عبر Service Layer.",
    issuesSanamKey: false,
    steps: [{ titleAr: "قريباً", bodyAr: "يتطلب عادة إعداداً مع مستشار SAP." }],
    fields: [],
  },
  {
    id: "orax_soft",
    nameAr: "أوراكس سوفت (Orax Soft)",
    nameEn: "Orax Soft",
    category: "erp",
    status: "available",
    descriptionAr: "مزامنة المنتجات والأسعار والمخزون والعروض عبر Partner Catalog API الخاص بسنام.",
    scopes: [
      "products:read",
      "products:write",
      "stock:read",
      "stock:write",
      "prices:read",
      "prices:write",
      "offers:write",
      "categories:read",
      "branches:read",
    ],
    connectMode: "inbound",
    howItWorksAr:
      "سنام يصدر مفتاح API. أوراكس (أو أي شريك) يرسل تحديثات المنتج/السعر/المخزون/العرض إلى واجهتنا الموحدة وفق توثيق v1.",
    issuesSanamKey: true,
    steps: [
      {
        titleAr: "أنشئ مفتاح سنام لأوراكس",
        bodyAr: "اضغط «إنشاء مفتاح API» وانسخه فوراً — يُعرض مرة واحدة فقط.",
      },
      {
        titleAr: "اختبر الاتصال",
        bodyAr: "GET /v1/ping مع Authorization: Bearer sanam_live_…",
      },
      {
        titleAr: "اربط الفروع",
        bodyAr: "GET /v1/branches ثم استخدم branch_code في كل طلب منتج.",
      },
      {
        titleAr: "ابدأ المزامنة",
        bodyAr: "POST /v1/products للإضافة/التعديل، وPATCH للمخزون والأسعار، وPOST/DELETE للعروض.",
      },
    ],
    fields: [],
  },
  {
    id: "custom_webhook",
    nameAr: "ربط مخصص (Webhook / API)",
    nameEn: "Custom API",
    category: "pos",
    status: "available",
    descriptionAr: "مفتاح API خاص بمتجرك لمزامنة أي كاشير أو نظام ERP عبر معيار سنام الموحد.",
    scopes: [
      "products:read",
      "products:write",
      "stock:read",
      "stock:write",
      "prices:read",
      "prices:write",
      "offers:write",
      "categories:read",
      "branches:read",
    ],
    connectMode: "inbound",
    howItWorksAr:
      "سنام يصدر لك مفتاح API سري (يُعرض مرة واحدة). تضعه في نظامك كـ Bearer Token وتستدعي Partner Catalog API.",
    issuesSanamKey: true,
    steps: [
      {
        titleAr: "أنشئ مفتاح سنام",
        bodyAr: "اضغط «إنشاء مفتاح API» وانسخه فوراً — لن يظهر كاملاً مرة أخرى.",
      },
      {
        titleAr: "ضع المفتاح في نظامك",
        bodyAr: "Authorization: Bearer sanam_live_… على كل طلب HTTPS.",
      },
      {
        titleAr: "اختبر التوثيق",
        bodyAr: "GET /v1/ping ثم GET /v1/docs لاستلام قائمة المسارات والحقول.",
      },
      {
        titleAr: "فعّل المزامنة",
        bodyAr: "أرسل المنتجات والأسعار والمخزون والعروض وفق صيغة سنام الموحدة.",
      },
    ],
    fields: [
      {
        id: "webhook_url",
        labelAr: "رابط إشعارات نظامك (اختياري)",
        placeholder: "https://your-pos.example/hooks/sanam",
        required: false,
        helpAr: "https فقط — للاستخدام المستقبلي عند إرسال المبيعات من سنام",
      },
    ],
  },
];

/** Public scopes issued for inbound partner keys */
export const PARTNER_CATALOG_SCOPES = [
  "products:read",
  "products:write",
  "stock:read",
  "stock:write",
  "prices:read",
  "prices:write",
  "offers:write",
  "categories:read",
  "branches:read",
] as const;

export function partnerCatalogBaseUrl(supabaseUrl?: string): string {
  const base =
    (supabaseUrl || (typeof import.meta !== "undefined" ? (import.meta as any).env?.VITE_SUPABASE_URL : "") || "")
      .toString()
      .replace(/\/$/, "");
  if (!base) return "https://YOUR_PROJECT.supabase.co/functions/v1/partner-catalog";
  return `${base}/functions/v1/partner-catalog`;
}

export type PosProviderConnection = {
  status: "idle" | "connected" | "error";
  fields: Record<string, string>;
  sanam_key_prefix?: string;
  sanam_key_id?: string;
  connected_at?: string | null;
  last_test_at?: string | null;
  last_test_ok?: boolean | null;
  last_error?: string | null;
};

export type PosFeatures = {
  enabled: boolean;
  tax_rate: number;
  prices_include_tax: boolean;
  allow_negative_stock: boolean;
  require_shift: boolean;
  receipt_footer: string;
  zatca_ready: boolean;
  automation_daily_report: boolean;
  automation_low_stock_whatsapp: boolean;
  low_stock_threshold: number;
};

export const DEFAULT_POS_FEATURES: PosFeatures = {
  enabled: false,
  tax_rate: 15,
  prices_include_tax: true,
  allow_negative_stock: false,
  require_shift: true,
  receipt_footer: "شكراً لتسوقكم من سنام",
  zatca_ready: false,
  automation_daily_report: true,
  automation_low_stock_whatsapp: true,
  low_stock_threshold: 5,
};

export type PosIntegrationsSetting = {
  enabled: boolean;
  /** provider ids the merchant opted to enable */
  connected: string[];
  /** per-provider connection wizard state */
  connections?: Record<string, PosProviderConnection>;
  notes?: string;
};

export const DEFAULT_POS_INTEGRATIONS: PosIntegrationsSetting = {
  enabled: false,
  connected: [],
  connections: {},
  notes: "",
};

export function emptyProviderConnection(): PosProviderConnection {
  return {
    status: "idle",
    fields: {},
    connected_at: null,
    last_test_at: null,
    last_test_ok: null,
    last_error: null,
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a one-time-visible Sanam partner API key. */
export function generateSanamApiKey(): { full: string; prefix: string } {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const full = `sanam_live_${body}`;
  return { full, prefix: full.slice(0, 16) };
}

export type PosCartLine = {
  product_id: string;
  sell_unit?: "primary" | "alt";
  unit_label?: string;
  unit?: string | null;
  alt_unit?: string | null;
  units_per_pack?: number | null;
  name: string;
  barcode: string | null;
  unit_price: number;
  quantity: number;
  discount: number;
  stock_quantity: number;
};

export function posLineKey(line: { product_id: string; sell_unit?: string | null }) {
  return `${line.product_id}:${line.sell_unit || "primary"}`;
}

export function lineTotal(line: PosCartLine): number {
  return Math.max(0, line.unit_price * line.quantity - line.discount);
}

export function cartTotals(
  lines: PosCartLine[],
  discountTotal: number,
  taxRate: number,
  pricesIncludeTax: boolean,
) {
  const gross = lines.reduce((s, l) => s + lineTotal(l), 0);
  const discount = Math.min(discountTotal, gross);
  if (pricesIncludeTax) {
    const afterDiscount = gross - discount;
    const net = afterDiscount / (1 + taxRate / 100);
    const tax = afterDiscount - net;
    return {
      subtotal: round2(net),
      tax_total: round2(tax),
      discount_total: round2(discount),
      total: round2(afterDiscount),
    };
  }
  const net = gross - discount;
  const tax = net * (taxRate / 100);
  return {
    subtotal: round2(net),
    tax_total: round2(tax),
    discount_total: round2(discount),
    total: round2(net + tax),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Map Postgres / RPC errors to short Arabic cashier messages. */
export function formatPosError(error: unknown, fallback = "حدث خطأ غير متوقع"): string {
  const err = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  } | null;
  const raw = [err?.message, err?.details, err?.hint].filter(Boolean).join(" — ") ||
    (typeof error === "string" ? error : "") ||
    "";
  const msg = raw.toLowerCase();

  if (
    msg.includes("uq_pos_shifts_open_station") ||
    (msg.includes("duplicate key") && msg.includes("pos_shifts") && msg.includes("station"))
  ) {
    return "هذه المحطة لديها وردية مفتوحة مسبقاً. أغلق الوردية الحالية أولاً ثم أعد المحاولة.";
  }
  if (
    msg.includes("could not choose") ||
    msg.includes("function public.pos_create_sale") ||
    (msg.includes("pgrst202") || err?.code === "PGRST202")
  ) {
    return "تعذّر استدعاء دالة البيع (تعارض في الخادم). حدّث الصفحة ثم أعد المحاولة.";
  }
  if (msg.includes("لديك وردية مفتوحة")) {
    return "لديك وردية مفتوحة مسبقاً. أغلقها أولاً قبل فتح وردية جديدة.";
  }
  if (msg.includes("نظام الكاشير غير مفعّل") || msg.includes("نظام الكاشير غير مفعل")) {
    return "نظام الكاشير غير مفعّل من لوحة التحكم.";
  }
  if (msg.includes("فرع معطّل")) {
    return raw.trim();
  }
  if (msg.includes("محطة غير موجودة")) {
    return "المحطة غير موجودة أو غير نشطة.";
  }
  if (msg.includes("لا تملك صلاحية") || msg.includes("صلاحيات غير كافية")) {
    return "لا تملك صلاحية لإتمام البيع.";
  }
  if (msg.includes("لا توجد وردية") || msg.includes("وردية غير موجودة")) {
    return "لا توجد وردية مفتوحة.";
  }
  if (msg.includes("المخزون غير كاف")) {
    return raw.trim();
  }
  if (msg.includes("منتج غير متوفر")) {
    return "أحد المنتجات غير متوفر في فرع هذه الوردية.";
  }
  if (msg.includes("مبلغ الدفع أقل")) {
    return "مبلغ الدفع أقل من الإجمالي.";
  }
  if (msg.includes("unique") || msg.includes("duplicate key")) {
    return "تعذّر إتمام العملية لأن البيانات مكررة. حدّث الصفحة ثم أعد المحاولة.";
  }
  if (msg.includes("permission denied") || msg.includes("row-level security")) {
    return "ليس لديك صلاحية لتنفيذ هذه العملية.";
  }
  if (msg.includes("jwt") || msg.includes("not authenticated")) {
    return "انتهت الجلسة. سجّل الدخول مرة أخرى.";
  }

  // Prefer already-Arabic messages from the database
  if (/[\u0600-\u06FF]/.test(raw)) return raw.trim();
  // Surface unknown English errors briefly so cashiers aren't stuck with a blank reason
  if (raw.trim()) {
    const short = raw.trim().slice(0, 160);
    return `${fallback}: ${short}`;
  }
  return fallback;
}
