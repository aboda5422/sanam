import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Loader2, Search, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PANEL_ROLE_BADGE, type AdminPanelRole } from "@/lib/staff-access";

const ENTITY_LABEL: Record<string, string> = {
  orders: "طلبات",
  products: "منتجات",
  categories: "أقسام",
  complaints: "شكاوى",
  drivers: "مناديب",
  branches: "فروع",
  store_settings: "إعدادات",
  user_roles: "صلاحيات",
  announcements: "إعلانات",
  payments: "مدفوعات",
  auth: "دخول",
  system: "نظام",
};

const ACTION_LABEL: Record<string, string> = {
  insert: "إضافة",
  update: "تعديل",
  delete: "حذف",
  login: "دخول",
};

const ROLE_LABEL: Record<string, string> = {
  ...PANEL_ROLE_BADGE,
  driver: "مندوب",
  customer: "عميل",
  unknown: "مستخدم",
};

type ActivityRow = {
  id: string;
  created_at: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  branch_id: string | null;
  summary: string;
};

const AdminActivityLogSection = () => {
  const { isSuperAdmin, isSiteWide, branches, filterBranchId, scopedBranchIds } = useAdminAuth();
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("all");
  const [localBranch, setLocalBranch] = useState<string>("layout");

  const branchFilter = localBranch === "layout"
    ? filterBranchId
    : localBranch === "all"
      ? null
      : localBranch;

  const { data: rows = [], isLoading, isFetching } = useQuery({
    queryKey: ["admin-activity-log", branchFilter, scopedBranchIds],
    queryFn: async () => {
      await supabase.rpc("purge_admin_activity_log");
      let q = supabase
        .from("admin_activity_log")
        .select("id, created_at, actor_name, actor_role, action, entity_type, branch_id, summary")
        .order("created_at", { ascending: false })
        .limit(400);
      if (branchFilter) q = q.eq("branch_id", branchFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ActivityRow[];
    },
    refetchInterval: 20_000,
  });

  const filtered = useMemo(() => {
    const s = search.trim();
    return rows.filter((r) => {
      if (entity !== "all" && r.entity_type !== entity) return false;
      if (!s) return true;
      return `${r.summary} ${r.actor_name || ""}`.includes(s);
    });
  }, [rows, search, entity]);

  const branchName = (id: string | null) => {
    if (!id) return "الموقع";
    return branches.find((b) => b.id === id)?.name || "فرع";
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        عمليات المدراء والمستخدمين خلال آخر 48 ساعة. تُحذف السجلات الأقدم تلقائياً.
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="relative sm:col-span-1">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pr-8"
            placeholder="بحث في العملية أو الاسم"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger>
            <SelectValue placeholder="النوع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(isSuperAdmin || isSiteWide) && (
          <Select value={localBranch} onValueChange={setLocalBranch}>
            <SelectTrigger>
              <SelectValue placeholder="الفرع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="layout">حسب فلتر اللوحة</SelectItem>
              <SelectItem value="all">كل الفروع</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-10 space-y-2">
          <ScrollText className="h-8 w-8 mx-auto opacity-40" />
          <p>لا توجد عمليات مسجّلة بعد</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {isFetching && <p className="text-xs text-muted-foreground">جاري التحديث…</p>}
          {filtered.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 space-y-1">
              <p className="text-sm font-medium leading-6">{r.summary}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{r.actor_name || "مستخدم"}</Badge>
                <Badge variant="outline">
                  {ROLE_LABEL[r.actor_role as AdminPanelRole] || ROLE_LABEL[r.actor_role || ""] || r.actor_role}
                </Badge>
                <Badge variant="outline">{ACTION_LABEL[r.action] || r.action}</Badge>
                <Badge variant="outline">{ENTITY_LABEL[r.entity_type] || r.entity_type}</Badge>
                <Badge variant="outline">{branchName(r.branch_id)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground" dir="ltr">
                {format(new Date(r.created_at), "yyyy/MM/dd HH:mm", { locale: ar })}
                {" · "}
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ar })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminActivityLogSection;
