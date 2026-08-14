import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Wallet,
  MessageSquare,
  Settings,
  LogOut,
  FolderTree,
  Store,
  BarChart3,
  Users,
  Megaphone,
  Mail,
  Timer,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { allowedAdminPaths } from "@/lib/staff-access";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import logo from "@/assets/logo-full-light.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "لوحة التحكم", url: "/admin", icon: LayoutDashboard },
  { title: "الطلبات", url: "/admin/orders", icon: ShoppingCart },
  { title: "المنتجات", url: "/admin/products", icon: Package },
  { title: "الأقسام", url: "/admin/categories", icon: FolderTree },
  { title: "الفروع", url: "/admin/branches", icon: Store },
];

const operationItems = [
  { title: "إدارة العملاء", url: "/admin/customers", icon: Users },
  { title: "إدارة المناديب", url: "/admin/drivers", icon: Truck },
  { title: "إعدادات التوصيل", url: "/admin/delivery", icon: Timer },
  { title: "الشكاوى", url: "/admin/complaints", icon: MessageSquare },
];

const settingsItems = [
  { title: "الحسابات والمبيعات", url: "/admin/sales", icon: BarChart3 },
  { title: "سجل المدفوعات", url: "/admin/payments", icon: Wallet },
  { title: "سجل البريد الإلكتروني", url: "/admin/email-logs", icon: Mail },
  { title: "الشعارات والإعلانات", url: "/admin/announcements", icon: Megaphone },
  { title: "الإعدادات", url: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAdminAuth();

  const isActive = (path: string) =>
    path === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(path);

  const allowed = new Set(allowedAdminPaths(role));
  const filterItems = (items: typeof mainItems) => items.filter((item) => allowed.has(item.url));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const renderGroup = (
    label: string,
    items: typeof mainItems
  ) => {
    if (items.length === 0) return null;
    return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                isActive={isActive(item.url)}
              >
                <NavLink
                  to={item.url}
                  end={item.url === "/admin"}
                  className="hover:bg-muted/50"
                  activeClassName="bg-primary/10 text-primary font-medium"
                >
                  <item.icon className="ml-2 h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" side="right" className="border-l-0 border-r">
      {/* direction:ltr moves the menu scrollbar to the physical right edge */}
      <SidebarContent className="[direction:ltr]">
        <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-2">
          {!collapsed && (
            <div className="p-4 border-b border-sidebar-border flex items-center gap-2">
              <img src={logo} alt="سنام" className="h-9 w-auto" />
              <div>
                <p className="text-xs text-muted-foreground">لوحة الإدارة</p>
              </div>
            </div>
          )}
          {renderGroup("الرئيسية", filterItems(mainItems))}
          {renderGroup("العمليات", filterItems(operationItems))}
          {renderGroup("النظام", filterItems(settingsItems))}
        </div>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 active:bg-red-50 active:text-red-700"
            >
              <LogOut className="ml-2 h-4 w-4" />
              {!collapsed && <span>تسجيل الخروج</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
