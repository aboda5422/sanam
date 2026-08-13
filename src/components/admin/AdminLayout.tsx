import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { AdminAuthProvider, useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminErrorBoundary } from "./AdminErrorBoundary";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

const AdminShell = ({ children, title }: AdminLayoutProps) => {
  const { loading, isSuperAdmin, branches, filterBranchId, setFilterBranchId, scopedBranchIds } =
    useAdminAuth();

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
              {isSuperAdmin ? (
                <Select
                  value={filterBranchId || "all"}
                  onValueChange={(v) => setFilterBranchId(v === "all" ? null : v)}
                >
                  <SelectTrigger className="w-[200px] h-9">
                    <SelectValue placeholder="كل الفروع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {branches.map((b) => (
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
                {isSuperAdmin ? "أدمن عام" : "مدير فرع"}
              </Badge>
            </div>
          </header>
          {/* dir=rtl keeps the content scrollbar on the left (toward the page start) */}
          <main className="flex-1 min-h-0 p-4 md:p-6 overflow-y-auto" dir="rtl">
            <AdminErrorBoundary>{children}</AdminErrorBoundary>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

const AdminLayout = ({ children, title }: AdminLayoutProps) => (
  <AdminAuthProvider>
    <AdminShell title={title}>{children}</AdminShell>
  </AdminAuthProvider>
);

export default AdminLayout;
