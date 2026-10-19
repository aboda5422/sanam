export type StaffRole = "site_admin" | "accountant" | "inventory" | "support";
export type AdminPanelRole = StaffRole | "store_admin";

export const STAFF_ROLES: StaffRole[] = ["site_admin", "accountant", "inventory", "support"];

/** مناصب تُنشأ من إعدادات الموقع → «مستخدمي الموقع». */
export const SITE_STAFF_CREATABLE_ROLES: StaffRole[] = ["accountant", "inventory", "support"];

export const PANEL_ROLES: AdminPanelRole[] = [
  "site_admin",
  "store_admin",
  "accountant",
  "inventory",
  "support",
];

export const STAFF_ROLE_META: Record<
  StaffRole,
  { label: string; hint: string; color: string }
> = {
  site_admin: {
    label: "مدير الموقع",
    hint: "صلاحيات كاملة لكل اللوحة",
    color: "bg-red-100 text-red-800",
  },
  accountant: {
    label: "محاسب",
    hint: "التحصيل والحسابات والمبيعات والمدفوعات",
    color: "bg-amber-100 text-amber-800",
  },
  inventory: {
    label: "مخزون",
    hint: "المنتجات والأقسام",
    color: "bg-emerald-100 text-emerald-800",
  },
  support: {
    label: "شكاوى العملاء",
    hint: "العملاء والشكاوى والتقييمات",
    color: "bg-sky-100 text-sky-800",
  },
};

export const PANEL_ROLE_BADGE: Record<AdminPanelRole, string> = {
  site_admin: "أدمن عام",
  store_admin: "مدير فرع",
  accountant: "محاسب",
  inventory: "مخزون",
  support: "شكاوى",
};

const ALL_ADMIN_PATHS = [
  "/admin",
  "/admin/orders",
  "/admin/products",
  "/admin/categories",
  "/admin/branches",
  "/admin/customers",
  "/admin/drivers",
  "/admin/delivery",
  "/admin/complaints",
  "/admin/sales",
  "/admin/collections",
  "/admin/payments",
  "/admin/email-logs",
  "/admin/ratings",
  "/admin/announcements",
  "/admin/home",
  "/admin/settings",
  "/admin/pos",
];

const ROLE_PATHS: Record<AdminPanelRole, string[]> = {
  site_admin: ALL_ADMIN_PATHS,
  store_admin: ALL_ADMIN_PATHS,
  accountant: [
    "/admin",
    "/admin/sales",
    "/admin/payments",
    "/admin/pos",
    "/admin/collections",
    "/admin/ratings",
    "/admin/drivers",
  ],
  inventory: ["/admin", "/admin/products", "/admin/categories"],
  support: ["/admin", "/admin/customers", "/admin/complaints", "/admin/ratings"],
};

export function isPanelRole(role: string | null | undefined): role is AdminPanelRole {
  return !!role && (PANEL_ROLES as string[]).includes(role);
}

export function allowedAdminPaths(role: AdminPanelRole | null): string[] {
  if (!role) return ["/admin"];
  return ROLE_PATHS[role] || ["/admin"];
}

export function canAccessAdminPath(role: AdminPanelRole | null, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  const allowed = allowedAdminPaths(role);
  return allowed.some((p) => (p === "/admin" ? path === "/admin" : path.startsWith(p)));
}

export function pickAdminRole(roles: { role: string }[] | null | undefined): AdminPanelRole | null {
  const set = new Set((roles || []).map((r) => r.role));
  if (set.has("site_admin")) return "site_admin";
  if (set.has("store_admin")) return "store_admin";
  if (set.has("accountant")) return "accountant";
  if (set.has("inventory")) return "inventory";
  if (set.has("support")) return "support";
  return null;
}

export function defaultAdminHome(_role: AdminPanelRole | null): string {
  return "/admin";
}

/** Legacy: cash wallet settle from drivers page — hub only now. */
export function canSettleDriverWallet(_role: AdminPanelRole | null): boolean {
  return false;
}

/** سداد أجور التوصيل للمندوب. */
export function canSettleDriverWages(role: AdminPanelRole | null): boolean {
  if (!role) return false;
  return role === "site_admin" || role === "store_admin" || role === "accountant";
}

export function hasFullCollectionHubTabs(role: AdminPanelRole | null): boolean {
  if (!role) return false;
  return role === "site_admin" || role === "store_admin" || role === "accountant";
}

/** استلام نقد المناديب في مركز التحصيل. */
export function canSettleDriverCashAtHub(
  role: AdminPanelRole | null,
  channel?: "wholesale" | "retail",
): boolean {
  if (!role) return false;
  if (channel === "wholesale") return false;
  return role === "site_admin" || role === "store_admin" || role === "accountant";
}

/** استلام نقد كاشير POS في مركز التحصيل — سنام يبقي الكاشير مفعّلاً. */
export function canCollectPosCashAtHub(role: AdminPanelRole | null): boolean {
  if (!role) return false;
  return role === "site_admin" || role === "accountant";
}

export function canAccessCollectionsHub(role: AdminPanelRole | null): boolean {
  if (!role) return false;
  return canAccessAdminPath(role, "/admin/collections");
}

export function canViewDriverCashCollectionTab(
  role: AdminPanelRole | null,
  channel?: "wholesale" | "retail",
): boolean {
  if (!canAccessCollectionsHub(role)) return false;
  if (channel === "wholesale") return false;
  if (hasFullCollectionHubTabs(role)) return true;
  return canSettleDriverCashAtHub(role, channel ?? "retail");
}

export function canViewCashierCashCollectionTab(role: AdminPanelRole | null): boolean {
  return canAccessCollectionsHub(role);
}

export function canViewCollectionRegistryTab(role: AdminPanelRole | null): boolean {
  return canAccessCollectionsHub(role);
}

export function canViewWholesaleSalesCollection(_role: AdminPanelRole | null): boolean {
  return false;
}
