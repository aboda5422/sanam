import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, MonitorSmartphone, UserPlus, Users, Pencil, Trash2, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { writeBranchId } from "@/lib/branch-scope";
import { DEFAULT_POS_FEATURES, type PosFeatures } from "@/lib/pos";
import {
  DATE_PERIOD_OPTIONS,
  DEFAULT_DATE_PERIOD,
  datePeriodRange,
  rangeIsoBounds,
  type DatePeriod,
} from "@/lib/date-period-filter";

type CashierRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  username: string;
  branch_id: string | null;
  branch_names: string[];
  created_at: string | null;
  last_sign_in_at: string | null;
  last_sale_at: string | null;
  sales_count: number;
  sales_total: number;
  has_open_shift: boolean;
};

function formatArDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

const AdminPosPage = () => {
  const { scopedBranchIds, filterBranchId, branches } = useAdminAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<DatePeriod>(DEFAULT_DATE_PERIOD);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stationForm, setStationForm] = useState({ branch_id: "", name: "", code: "" });
  const [cashierForm, setCashierForm] = useState({
    full_name: "",
    username: "",
    password: "",
    branch_id: "",
    phone: "",
  });
  const [editCashier, setEditCashier] = useState<CashierRow | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    username: "",
    password: "",
    branch_id: "",
    phone: "",
  });
  const [deleteCashier, setDeleteCashier] = useState<CashierRow | null>(null);
  const [showStationForm, setShowStationForm] = useState(false);
  const [showCashierForm, setShowCashierForm] = useState(false);

  const salesRange = useMemo(
    () => datePeriodRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );
  const salesBounds = useMemo(
    () => rangeIsoBounds(salesRange.from, salesRange.to),
    [salesRange],
  );

  const salesBranches = useMemo(() => {
    const list = branches || [];
    if (scopedBranchIds?.length) return list.filter((b) => scopedBranchIds.includes(b.id));
    return list;
  }, [branches, scopedBranchIds]);

  const effectiveSalesBranchId = useMemo(() => {
    if (filterBranchId && salesBranches.some((b) => b.id === filterBranchId)) {
      return filterBranchId;
    }
    if (salesBranches.length === 1) return salesBranches[0].id;
    return "all";
  }, [salesBranches, filterBranchId]);

  const branchScopeLabel = useMemo(() => {
    if (effectiveSalesBranchId !== "all") {
      return salesBranches.find((b) => b.id === effectiveSalesBranchId)?.name || "فرع محدد";
    }
    return "كل الفروع";
  }, [effectiveSalesBranchId, salesBranches]);

  const periodLabel = useMemo(() => {
    if (period === "today") return "اليوم";
    if (period === "week") return "آخر 7 أيام";
    if (period === "all") return "كل الفترات";
    if (customFrom && customTo) return `${customFrom} → ${customTo}`;
    if (customFrom) return `من ${customFrom}`;
    if (customTo) return `حتى ${customTo}`;
    return "مخصص";
  }, [period, customFrom, customTo]);

  const salesTitle = `مبيعات الكاشير · ${periodLabel} · ${branchScopeLabel}`;

  const { data: features } = useQuery({
    queryKey: ["store-settings", "pos_features"],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", "pos_features")
        .maybeSingle();
      return { ...DEFAULT_POS_FEATURES, ...((data?.value as Partial<PosFeatures>) || {}) };
    },
  });

  const { data: stations = [], isLoading: stationsLoading } = useQuery({
    queryKey: ["admin-pos-stations", scopedBranchIds],
    queryFn: async () => {
      let q = supabase
        .from("pos_stations")
        .select("id, name, code, is_active, branch_id, branches(name)")
        .order("code");
      if (scopedBranchIds && scopedBranchIds.length) {
        q = q.in("branch_id", scopedBranchIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: periodSales = [], isLoading: salesLoading } = useQuery({
    queryKey: [
      "admin-pos-sales",
      period,
      customFrom,
      customTo,
      salesBounds.fromIso,
      salesBounds.toIso,
      scopedBranchIds,
      effectiveSalesBranchId,
    ],
    queryFn: async () => {
      let q = supabase
        .from("pos_sales")
        .select("id, invoice_number, total, tax_total, created_at, branch_id, status, branches(name)")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(500);
      if (salesBounds.fromIso) q = q.gte("created_at", salesBounds.fromIso);
      if (salesBounds.toIso) q = q.lte("created_at", salesBounds.toIso);
      if (effectiveSalesBranchId !== "all") {
        q = q.eq("branch_id", effectiveSalesBranchId);
      } else if (scopedBranchIds && scopedBranchIds.length) {
        q = q.in("branch_id", scopedBranchIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  /** Live open shifts only (`status = 'open'`), scoped to the selected branch. */
  const { data: openShifts = [], isLoading: openShiftsLoading } = useQuery({
    queryKey: ["admin-pos-open-shifts", scopedBranchIds, effectiveSalesBranchId],
    queryFn: async () => {
      let q = supabase
        .from("pos_shifts")
        .select(
          "id, opened_at, opening_cash, branch_id, station_id, cashier_id, status, pos_stations(name), branches(name)",
        )
        .eq("status", "open")
        .order("opened_at", { ascending: false });
      if (effectiveSalesBranchId !== "all") {
        q = q.eq("branch_id", effectiveSalesBranchId);
      } else if (scopedBranchIds && scopedBranchIds.length) {
        q = q.in("branch_id", scopedBranchIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).filter((s: any) => s.status === "open");
    },
  });

  const { data: cashiers = [], isLoading: cashiersLoading } = useQuery({
    queryKey: ["admin-pos-cashiers", scopedBranchIds, branches],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "cashier");
      if (rolesErr) throw rolesErr;
      const ids = [...new Set((roles || []).map((r) => r.user_id))];
      if (ids.length === 0) return [] as CashierRow[];

      const [{ data: profiles }, { data: access }, authMetaRes, { data: sales }, { data: openShiftsRows }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("user_id, full_name, phone, created_at")
            .in("user_id", ids),
          supabase.from("admin_branch_access" as any).select("user_id, branch_id").in("user_id", ids),
          supabase.rpc("admin_staff_auth_meta" as any),
          supabase
            .from("pos_sales" as any)
            .select("cashier_id, total, created_at, status")
            .in("cashier_id", ids)
            .eq("status", "completed"),
          supabase
            .from("pos_shifts" as any)
            .select("cashier_id")
            .in("cashier_id", ids)
            .eq("status", "open"),
        ]);

      type AuthMeta = {
        user_id: string;
        email: string;
        created_at: string | null;
        last_sign_in_at: string | null;
      };
      const authByUser = new Map<string, AuthMeta>();
      for (const row of (authMetaRes.data as AuthMeta[] | null) || []) {
        if (row?.user_id) authByUser.set(row.user_id, row);
      }

      const branchNameById = new Map((branches || []).map((b) => [b.id, b.name]));
      const accessByUser = new Map<string, { ids: string[]; names: string[] }>();
      for (const row of (access as { user_id: string; branch_id: string }[] | null) || []) {
        const bid = row.branch_id;
        if (scopedBranchIds?.length && !scopedBranchIds.includes(bid)) continue;
        const cur = accessByUser.get(row.user_id) || { ids: [], names: [] };
        cur.ids.push(bid);
        cur.names.push(branchNameById.get(bid) || "—");
        accessByUser.set(row.user_id, cur);
      }

      const salesByUser = new Map<string, { count: number; total: number; last: string | null }>();
      for (const row of (sales as { cashier_id: string; total: number; created_at: string }[] | null) || []) {
        const cur = salesByUser.get(row.cashier_id) || { count: 0, total: 0, last: null };
        cur.count += 1;
        cur.total += Number(row.total || 0);
        if (!cur.last || row.created_at > cur.last) cur.last = row.created_at;
        salesByUser.set(row.cashier_id, cur);
      }

      const openShiftSet = new Set(
        ((openShiftsRows as { cashier_id: string }[] | null) || []).map((r) => r.cashier_id),
      );
      const profileByUser = new Map((profiles || []).map((p) => [p.user_id, p]));

      return ids
        .map((user_id) => {
          const accessInfo = accessByUser.get(user_id);
          if (scopedBranchIds?.length && (!accessInfo || accessInfo.names.length === 0)) return null;
          const p = profileByUser.get(user_id);
          const auth = authByUser.get(user_id);
          const email = auth?.email || "";
          const username = email.endsWith("@staff.sanam")
            ? email.slice(0, -"@staff.sanam".length)
            : email || "—";
          const s = salesByUser.get(user_id);
          return {
            user_id,
            full_name: p?.full_name ?? null,
            phone: p?.phone ?? null,
            username,
            branch_id: accessInfo?.ids[0] ?? null,
            branch_names: accessInfo?.names ?? [],
            created_at: auth?.created_at || p?.created_at || null,
            last_sign_in_at: auth?.last_sign_in_at || null,
            last_sale_at: s?.last || null,
            sales_count: s?.count || 0,
            sales_total: s?.total || 0,
            has_open_shift: openShiftSet.has(user_id),
          } satisfies CashierRow;
        })
        .filter(Boolean) as CashierRow[];
    },
  });

  const addStation = useMutation({
    mutationFn: async () => {
      if (!stationForm.branch_id || !stationForm.name || !stationForm.code) {
        throw new Error("أكمل بيانات المحطة");
      }
      const { error } = await supabase.from("pos_stations").insert({
        branch_id: stationForm.branch_id,
        name: stationForm.name,
        code: stationForm.code.toUpperCase(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت إضافة المحطة");
      setStationForm({ branch_id: "", name: "", code: "" });
      setShowStationForm(false);
      queryClient.invalidateQueries({ queryKey: ["admin-pos-stations"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addCashier = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_cashier" as any, {
        p_full_name: cashierForm.full_name,
        p_username: cashierForm.username,
        p_password: cashierForm.password,
        p_branch_id: cashierForm.branch_id,
        p_phone: cashierForm.phone || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("تم إنشاء حساب الكاشير");
      setCashierForm({ full_name: "", username: "", password: "", branch_id: "", phone: "" });
      setShowCashierForm(false);
      queryClient.invalidateQueries({ queryKey: ["admin-pos-cashiers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCashierMutation = useMutation({
    mutationFn: async () => {
      if (!editCashier) throw new Error("لا يوجد كاشير");
      if (!editForm.full_name.trim() || !editForm.username.trim() || !editForm.branch_id) {
        throw new Error("أكمل الاسم واسم المستخدم والفرع");
      }
      const { error } = await supabase.rpc("update_cashier" as any, {
        p_user_id: editCashier.user_id,
        p_full_name: editForm.full_name,
        p_username: editForm.username,
        p_branch_id: editForm.branch_id,
        p_password: editForm.password || null,
        p_phone: editForm.phone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث حساب الكاشير");
      setEditCashier(null);
      queryClient.invalidateQueries({ queryKey: ["admin-pos-cashiers"] });
    },
    onError: (e: any) => toast.error(e.message || "فشل التحديث"),
  });

  const deleteCashierMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("delete_cashier" as any, { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف حساب الكاشير");
      setDeleteCashier(null);
      queryClient.invalidateQueries({ queryKey: ["admin-pos-cashiers"] });
    },
    onError: (e: any) => toast.error(e.message || "فشل الحذف"),
  });

  const openEditCashier = (c: CashierRow) => {
    setEditCashier(c);
    setEditForm({
      full_name: c.full_name || "",
      username: c.username === "—" ? "" : c.username,
      password: "",
      branch_id: c.branch_id || "",
      phone: c.phone || "",
    });
  };

  const queueDaily = useMutation({
    mutationFn: async (branchId: string) => {
      const { error } = await supabase.rpc("pos_queue_daily_report" as any, {
        p_branch_id: branchId,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("تمت جدولة تقرير آخر اليوم"),
    onError: (e: any) => toast.error(e.message),
  });

  const periodTotal = periodSales.reduce((s, r) => s + Number(r.total || 0), 0);
  const reportBranchId =
    (effectiveSalesBranchId !== "all" ? effectiveSalesBranchId : null) ||
    writeBranchId(filterBranchId, scopedBranchIds) ||
    salesBranches[0]?.id;

  return (
    <AdminLayout title="نظام الكاشير">
      {!features?.enabled && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">
          نظام الكاشير غير مفعّل. فعّله من الإعدادات ← كاشير سنام السحابي.
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">الفترة</Label>
          <div className="flex flex-wrap gap-1.5">
            {DATE_PERIOD_OPTIONS.map((o) => (
              <Button
                key={o.id}
                type="button"
                size="sm"
                variant={period === o.id ? "default" : "outline"}
                onClick={() => setPeriod(o.id)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </div>
        {period === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">من</Label>
              <Input
                type="date"
                className="h-9 w-36"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">إلى</Label>
              <Input
                type="date"
                className="h-9 w-36"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                dir="ltr"
              />
            </div>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              مبيعات الكاشير ({periodLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" dir="ltr">
              {periodTotal.toFixed(2)} ر.س
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {periodSales.length} فاتورة · {branchScopeLabel}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">ورديات مفتوحة</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {openShiftsLoading ? "…" : openShifts.length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {openShifts.length === 0
                ? `لا وردية مفتوحة الآن · ${branchScopeLabel}`
                : openShifts
                    .slice(0, 2)
                    .map((s: any) => `${s.branches?.name || "فرع"} · ${s.pos_stations?.name || "محطة"}`)
                    .join(" · ")}
              {openShifts.length > 2 ? ` +${openShifts.length - 2}` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">المحطات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stations.length}</p>
            <a href="/cashier" target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              فتح واجهة الكاشير ↗
            </a>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {!showStationForm && (
          <Button type="button" variant="outline" onClick={() => setShowStationForm(true)}>
            <MonitorSmartphone className="h-4 w-4 ml-2" />
            إضافة محطة كاشير جديدة
          </Button>
        )}
        {!showCashierForm && (
          <Button type="button" variant="outline" onClick={() => setShowCashierForm(true)}>
            <UserPlus className="h-4 w-4 ml-2" />
            إنشاء حساب كاشير جديد
          </Button>
        )}
      </div>

      {(showStationForm || showCashierForm) && (
        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          {showStationForm && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <MonitorSmartphone className="h-4 w-4" /> إضافة محطة كاشير
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1"
                  onClick={() => setShowStationForm(false)}
                >
                  <ChevronUp className="h-4 w-4" />
                  طي
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>الفرع</Label>
                  <select
                    className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
                    value={stationForm.branch_id}
                    onChange={(e) => setStationForm({ ...stationForm, branch_id: e.target.value })}
                  >
                    <option value="">اختر...</option>
                    {(branches || []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>اسم المحطة</Label>
                    <Input
                      value={stationForm.name}
                      onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })}
                      placeholder="كاشير 4"
                    />
                  </div>
                  <div>
                    <Label>الرمز</Label>
                    <Input
                      value={stationForm.code}
                      onChange={(e) => setStationForm({ ...stationForm, code: e.target.value })}
                      placeholder="C4"
                      dir="ltr"
                    />
                  </div>
                </div>
                <Button onClick={() => addStation.mutate()} disabled={addStation.isPending}>
                  {addStation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
                  إضافة محطة
                </Button>
              </CardContent>
            </Card>
          )}

          {showCashierForm && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> إنشاء حساب كاشير
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1"
                  onClick={() => setShowCashierForm(false)}
                >
                  <ChevronUp className="h-4 w-4" />
                  طي
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>الاسم</Label>
                    <Input
                      value={cashierForm.full_name}
                      onChange={(e) => setCashierForm({ ...cashierForm, full_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>اسم المستخدم</Label>
                    <Input
                      value={cashierForm.username}
                      onChange={(e) => setCashierForm({ ...cashierForm, username: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>كلمة المرور</Label>
                    <Input
                      type="password"
                      value={cashierForm.password}
                      onChange={(e) => setCashierForm({ ...cashierForm, password: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <Label>الجوال</Label>
                    <Input
                      value={cashierForm.phone}
                      onChange={(e) => setCashierForm({ ...cashierForm, phone: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                </div>
                <div>
                  <Label>الفرع</Label>
                  <select
                    className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
                    value={cashierForm.branch_id}
                    onChange={(e) => setCashierForm({ ...cashierForm, branch_id: e.target.value })}
                  >
                    <option value="">اختر...</option>
                    {(branches || []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={() => addCashier.mutate()} disabled={addCashier.isPending}>
                  {addCashier.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <UserPlus className="h-4 w-4 ml-2" />}
                  إنشاء كاشير
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> حسابات الكاشير الحالية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {cashiersLoading && <Loader2 className="h-5 w-5 animate-spin" />}
          {!cashiersLoading && cashiers.length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد حسابات كاشير بعد</p>
          )}
          {cashiers.map((c) => {
            const lastActivity = [c.last_sale_at, c.last_sign_in_at]
              .filter(Boolean)
              .sort()
              .at(-1) as string | undefined;
            return (
              <div key={c.user_id} className="border rounded-lg p-3 text-sm space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{c.full_name || "بدون اسم"}</p>
                      {c.has_open_shift && <Badge className="bg-emerald-600">وردية مفتوحة</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                      {c.username}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {c.branch_names.length === 0 ? (
                      <Badge variant="secondary">بدون فرع</Badge>
                    ) : (
                      c.branch_names.map((name) => (
                        <Badge key={`${c.user_id}-${name}`} variant="outline">
                          {name}
                        </Badge>
                      ))
                    )}
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => openEditCashier(c)}>
                      <Pencil className="h-3.5 w-3.5" /> تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 text-destructive hover:text-destructive"
                      onClick={() => setDeleteCashier(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <div>
                    <p>تاريخ الإنشاء</p>
                    <p className="text-foreground font-medium mt-0.5">{formatArDate(c.created_at)}</p>
                  </div>
                  <div>
                    <p>آخر نشاط</p>
                    <p className="text-foreground font-medium mt-0.5">{formatArDate(lastActivity || null)}</p>
                  </div>
                  <div>
                    <p>آخر تسجيل دخول</p>
                    <p className="text-foreground font-medium mt-0.5">{formatArDate(c.last_sign_in_at)}</p>
                  </div>
                  <div>
                    <p>المبيعات</p>
                    <p className="text-foreground font-medium mt-0.5" dir="ltr">
                      {c.sales_count} فاتورة · {c.sales_total.toFixed(0)} ر.س
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!editCashier} onOpenChange={(o) => !o && setEditCashier(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل حساب كاشير</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>الاسم</Label>
                <Input
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                />
              </div>
              <div>
                <Label>اسم المستخدم</Label>
                <Input
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  dir="ltr"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>كلمة مرور جديدة (اختياري)</Label>
                <Input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  dir="ltr"
                  placeholder="اتركها فارغة للإبقاء"
                />
              </div>
              <div>
                <Label>الجوال</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  dir="ltr"
                />
              </div>
            </div>
            <div>
              <Label>الفرع</Label>
              <select
                className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
                value={editForm.branch_id}
                onChange={(e) => setEditForm({ ...editForm, branch_id: e.target.value })}
              >
                <option value="">اختر...</option>
                {(branches || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="w-full"
              onClick={() => updateCashierMutation.mutate()}
              disabled={updateCashierMutation.isPending}
            >
              {updateCashierMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Pencil className="h-4 w-4 ml-2" />
              )}
              حفظ التعديلات
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCashier} onOpenChange={(o) => !o && setDeleteCashier(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف حساب الكاشير</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف «{deleteCashier?.full_name || deleteCashier?.username}»؟
              {deleteCashier?.has_open_shift
                ? " لديه وردية مفتوحة — أغلق الوردية أولاً."
                : deleteCashier && deleteCashier.sales_count > 0
                  ? " ستُزال صلاحية الكاشير مع الإبقاء على سجل المبيعات."
                  : " سيُحذف الحساب نهائياً إن لم يكن له مبيعات."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCashierMutation.isPending || !!deleteCashier?.has_open_shift}
              onClick={(e) => {
                e.preventDefault();
                if (deleteCashier) deleteCashierMutation.mutate(deleteCashier.user_id);
              }}
            >
              {deleteCashierMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">المحطات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stationsLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            {stations.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                <div>
                  <p className="font-medium">
                    {s.branches?.name} · {s.name}
                  </p>
                  <p className="text-muted-foreground text-xs" dir="ltr">
                    {s.code}
                  </p>
                </div>
                <Badge variant={s.is_active ? "default" : "secondary"}>
                  {s.is_active ? "نشط" : "موقف"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">{salesTitle}</CardTitle>
              {reportBranchId && period === "today" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => queueDaily.mutate(reportBranchId)}
                  disabled={queueDaily.isPending}
                >
                  جدولة تقرير اليوم
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {salesLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            {!salesLoading && periodSales.length === 0 && (
              <p className="text-sm text-muted-foreground">
                لا مبيعات كاشير في {periodLabel} ({branchScopeLabel})
              </p>
            )}
            {periodSales.map((s: any) => (
              <div key={s.id} className="flex justify-between border rounded-lg p-3 text-sm">
                <div>
                  <p className="font-medium" dir="ltr">
                    {s.invoice_number}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.branches?.name ? `${s.branches.name} · ` : ""}
                    {period === "today"
                      ? new Date(s.created_at).toLocaleTimeString("ar-SA")
                      : new Date(s.created_at).toLocaleString("ar-SA")}
                  </p>
                </div>
                <p className="font-bold" dir="ltr">
                  {Number(s.total).toFixed(2)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminPosPage;
