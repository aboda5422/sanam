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
  MapPin,
  Wallet as WalletIcon,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";
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
  { title: "تتبع المناديب", url: "/admin/tracking", icon: MapPin },
  { title: "الشكاوى", url: "/admin/complaints", icon: MessageSquare },
];

const settingsItems = [
  { title: "الحسابات والمبيعات", url: "/admin/sales", icon: BarChart3 },
  { title: "محافظ المناديب", url: "/admin/wallets", icon: WalletIcon },
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

  const isActive = (path: string) =>
    path === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(path);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const renderGroup = (
    label: string,
    items: typeof mainItems
  ) => (
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

  return (
    <Sidebar collapsible="icon" side="right" className="border-l-0 border-r">
      <SidebarContent>
        {!collapsed && (
          <div className="p-4 border-b border-sidebar-border flex items-center gap-2">
            <img src={logo} alt="سنام" className="h-9 w-auto" />
            <div>
              <p className="text-xs text-muted-foreground">لوحة الإدارة</p>
            </div>
          </div>
        )}
        {renderGroup("الرئيسية", mainItems)}
        {renderGroup("العمليات", operationItems)}
        {renderGroup("النظام", settingsItems)}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut className="ml-2 h-4 w-4" />
              {!collapsed && <span>تسجيل الخروج</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
