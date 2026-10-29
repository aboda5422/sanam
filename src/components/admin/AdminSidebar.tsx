import { LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { allowedAdminPaths } from "@/lib/staff-access";
import {
  ADMIN_NAV_GROUP_LABELS,
  ADMIN_NAV_ITEMS,
  type AdminNavGroup,
} from "@/lib/admin-nav";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import logoFull from "@/assets/logo-full-light.png";
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
import { cn } from "@/lib/utils";

const GROUPS: AdminNavGroup[] = ["main", "operations", "system"];

export function AdminSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { role, navPaths } = useAdminAuth();

  const isActive = (path: string) =>
    path === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(path);

  const allowed = new Set(allowedAdminPaths(role, navPaths));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  const renderGroup = (group: AdminNavGroup) => {
    const items = ADMIN_NAV_ITEMS.filter((i) => i.group === group);
    if (items.length === 0) return null;
    return (
      <SidebarGroup key={group}>
        <SidebarGroupLabel>{ADMIN_NAV_GROUP_LABELS[group]}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const canOpen = allowed.has(item.path);
              return (
                <SidebarMenuItem key={item.path}>
                  {canOpen ? (
                    <SidebarMenuButton asChild isActive={isActive(item.path)}>
                      <NavLink
                        to={item.path}
                        end={item.path === "/admin"}
                        className="hover:bg-muted/50"
                        activeClassName="bg-primary/10 text-primary font-medium"
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <item.icon className="ml-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      disabled
                      aria-disabled
                      className={cn(
                        "pointer-events-none cursor-not-allowed opacity-40",
                        "text-muted-foreground",
                      )}
                      title="ليست ضمن صلاحياتك"
                    >
                      <item.icon className="ml-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              );
            })}
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
            <div className="p-3 border-b border-border bg-white space-y-2">
              <img
                src={logoFull}
                alt="سنام"
                className="h-11 w-full object-contain"
              />
              <p className="text-sm font-semibold tracking-wide text-foreground text-center">
                لوحة الإدارة
              </p>
            </div>
          )}
          {GROUPS.map((g) => renderGroup(g))}
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
