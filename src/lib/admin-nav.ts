import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Wallet,
  MessageSquare,
  Settings,
  FolderTree,
  Store,
  BarChart3,
  Users,
  Megaphone,
  Timer,
  MonitorSmartphone,
  Star,
} from "lucide-react";
import type { AdminPanelRole } from "@/lib/staff-access";

export type AdminNavGroup = "main" | "operations" | "system";

export type AdminNavItem = {
  title: string;
  path: string;
  group: AdminNavGroup;
  icon: LucideIcon;
  /** Roles granted in user_roles so existing RLS still works. */
  rlsRoles: AdminPanelRole[];
};

export const ADMIN_NAV_GROUP_LABELS: Record<AdminNavGroup, string> = {
  main: "الرئيسية",
  operations: "العمليات",
  system: "النظام",
};

/** Canonical sidebar / permission catalog (keep in sync with AdminSidebar). */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { title: "لوحة التحكم", path: "/admin", group: "main", icon: LayoutDashboard, rlsRoles: [] },
  { title: "الطلبات", path: "/admin/orders", group: "main", icon: ShoppingCart, rlsRoles: ["store_admin"] },
  { title: "المنتجات", path: "/admin/products", group: "main", icon: Package, rlsRoles: ["inventory"] },
  { title: "الأقسام", path: "/admin/categories", group: "main", icon: FolderTree, rlsRoles: ["inventory"] },
  { title: "الفروع", path: "/admin/branches", group: "main", icon: Store, rlsRoles: ["store_admin"] },
  { title: "إدارة العملاء", path: "/admin/customers", group: "operations", icon: Users, rlsRoles: ["support"] },
  { title: "إدارة المناديب", path: "/admin/drivers", group: "operations", icon: Truck, rlsRoles: ["accountant"] },
  { title: "إعدادات التوصيل", path: "/admin/delivery", group: "operations", icon: Timer, rlsRoles: ["store_admin"] },
  { title: "الشكاوى", path: "/admin/complaints", group: "operations", icon: MessageSquare, rlsRoles: ["support"] },
  { title: "تقييمات منخفضة", path: "/admin/ratings", group: "operations", icon: Star, rlsRoles: ["support", "accountant"] },
  { title: "نظام الكاشير", path: "/admin/pos", group: "system", icon: MonitorSmartphone, rlsRoles: ["accountant"] },
  { title: "الحسابات والمبيعات", path: "/admin/sales", group: "system", icon: BarChart3, rlsRoles: ["accountant"] },
  { title: "التحصيل", path: "/admin/collections", group: "system", icon: Wallet, rlsRoles: ["accountant"] },
  { title: "سجل المدفوعات", path: "/admin/payments", group: "system", icon: Wallet, rlsRoles: ["accountant"] },
  { title: "الشعارات والإعلانات", path: "/admin/announcements", group: "system", icon: Megaphone, rlsRoles: ["store_admin"] },
  { title: "الإعدادات", path: "/admin/settings", group: "system", icon: Settings, rlsRoles: ["store_admin"] },
];

export const ADMIN_NAV_PATHS = ADMIN_NAV_ITEMS.map((i) => i.path);

export const ADMIN_NAV_BY_PATH = Object.fromEntries(
  ADMIN_NAV_ITEMS.map((i) => [i.path, i]),
) as Record<string, AdminNavItem>;

export function adminNavItemsByGroup(group: AdminNavGroup): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((i) => i.group === group);
}

/** Roles to insert for RLS coverage given selected nav paths. */
export function rlsRolesForNavPaths(paths: string[]): AdminPanelRole[] {
  const roles = new Set<AdminPanelRole>();
  for (const path of paths) {
    const item = ADMIN_NAV_BY_PATH[path];
    if (!item) continue;
    for (const r of item.rlsRoles) roles.add(r);
  }
  return [...roles];
}

/** Normalize selection: only known paths, always include /admin if anything selected. */
export function normalizeNavPaths(paths: string[]): string[] {
  const known = new Set(ADMIN_NAV_PATHS);
  const next = [...new Set(paths.map((p) => p.replace(/\/+$/, "") || "/admin").filter((p) => known.has(p)))];
  if (next.length > 0 && !next.includes("/admin")) next.unshift("/admin");
  return next;
}
