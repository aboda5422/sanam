import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { AdminAuthProvider, useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminErrorBoundary } from "./AdminErrorBoundary";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PANEL_ROLE_BADGE, allowedAdminPaths, canAccessAdminPath } from "@/lib/staff-access";

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

type AdminShellContextValue = {
  setTitle: (title?: string) => void;
};

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

const AdminShell = ({ children, title }: AdminLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, isSuperAdmin, isSiteWide, role, branches, filterBranchId, setFilterBranchId, scopedBranchIds } =
    useAdminAuth();

  useEffect(() => {
    if (loading || !role) return;
    if (!canAccessAdminPath(role, location.pathname)) {
      navigate(allowedAdminPaths(role)[0] || "/admin", { replace: true });
    }
  }, [loading, role, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const branchLabel = (() => {
    if (isSuperAdmin && !filterBranchId) return "كل الفروع";
    const id = filterBranchId || scopedBranchIds?.[0];
    return branches.find((b) => b.id === id)?.name || "فرعي";
  })();

  return (
    <SidebarProvider>
      <div className="h-svh flex w-full overflow-hidden" dir="rtl">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <header className="sticky top-0 z-40 h-14 shrink-0 flex items-center gap-3 border-b bg-background/95 backdrop-blur px-4">
            <SidebarTrigger />
            {title && <h1 className="font-heading font-bold text-lg">{title}</h1>}
            <div className="mr-auto flex items-center gap-2">
              {isSuperAdmin || isSiteWide ? (
                <Select
                  value={filterBranchId || "all"}
                  onValueChange={(v) => setFilterBranchId(v === "all" ? null : v)}
                >
                  <SelectTrigger className="w-[200px] h-9">
                    <SelectValue placeholder="كل الفروع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    { (branches ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary">{branchLabel}</Badge>
              )}
              <Badge variant={isSuperAdmin ? "default" : "outline"}>
                {role ? PANEL_ROLE_BADGE[role] : "مستخدم"}
              </Badge>
            </div>
          </header>
          <main className="flex-1 min-h-0 p-4 md:p-6 overflow-y-auto" dir="rtl">
            <AdminErrorBoundary>{children}</AdminErrorBoundary>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

/** Persistent chrome for authenticated admin routes (sidebar survives page crashes). */
export function AdminAuthedShell({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | undefined>();
  return (
    <AdminShellContext.Provider value={{ setTitle }}>
      <AdminShell title={title}>{children}</AdminShell>
    </AdminShellContext.Provider>
  );
}

const AdminLayout = ({ children, title }: AdminLayoutProps) => {
  const shell = useContext(AdminShellContext);

  useEffect(() => {
    if (!shell) return;
    shell.setTitle(title);
    return () => shell.setTitle(undefined);
  }, [shell, title]);

  if (shell) return <>{children}</>;

  return (
    <AdminAuthProvider>
      <AdminShell title={title}>{children}</AdminShell>
    </AdminAuthProvider>
  );
};

export default AdminLayout;
