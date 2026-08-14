export type StaffRole = "site_admin" | "accountant" | "inventory" | "support";
export type AdminPanelRole = StaffRole | "store_admin";

export const STAFF_ROLES: StaffRole[] = ["site_admin", "accountant", "inventory", "support"];

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
    hint: "الحسابات والمبيعات والمدفوعات",
    color: "bg-amber-100 text-amber-800",
  },
  inventory: {
    label: "مخزون",
    hint: "المنتجات والأقسام",
    color: "bg-emerald-100 text-emerald-800",
  },
  support: {
    label: "شكاوى العملاء",
    hint: "العملاء والشكاوى",
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
  "/admin/payments",
  "/admin/email-logs",
  "/admin/announcements",
  "/admin/settings",
];

const ROLE_PATHS: Record<AdminPanelRole, string[]> = {
  site_admin: ALL_ADMIN_PATHS,
  store_admin: ALL_ADMIN_PATHS,
  accountant: ["/admin", "/admin/sales", "/admin/payments"],
  inventory: ["/admin", "/admin/products", "/admin/categories"],
  support: ["/admin", "/admin/customers", "/admin/complaints"],
};

export function isPanelRole(role: string | null | undefined): role is AdminPanelRole {
  return !!role && (PANEL_ROLES as string[]).includes(role);
}

export function allowedAdminPaths(role: AdminPanelRole | null): string[] {
  if (!role) return ["/admin"];
  return ROLE_PATHS[role] || ["/admin"];
}

export function canAccessAdminPath(role: AdminPanelRole | null, pathname: string): boolean {
  const allowed = allowedAdminPaths(role);
  return allowed.some((p) => (p === "/admin" ? pathname === "/admin" : pathname.startsWith(p)));
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
