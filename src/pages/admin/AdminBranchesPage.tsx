import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import DeliveryZonesEditor from "@/components/admin/DeliveryZonesEditor";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  Copy,
  Link2,
  Users,
  Map as MapIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type BranchRow = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  slug: string;
  lat?: number | null;
  lng?: number | null;
  is_active: boolean;
  delivery_zones?: { id: string; name: string; is_active: boolean }[];
  branch_delivery_rates?: {
    id: string;
    max_distance_km: number;
    fee: number;
    sort_order: number;
  }[];
};

type StoreAdmin = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
};

const AdminBranchesContent = () => {
  const queryClient = useQueryClient();
  const { isSuperAdmin, scopedBranchIds } = useAdminAuth();

  const [zonesBranch, setZonesBranch] = useState<BranchRow | null>(null);
  const [managersBranch, setManagersBranch] = useState<BranchRow | null>(null);
  const [ratesBranch, setRatesBranch] = useState<BranchRow | null>(null);
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [rateDrafts, setRateDrafts] = useState<
    { id?: string; max_distance_km: number; fee: number }[]
  >([]);

  const { data: branches, isLoading } = useQuery({
    queryKey: ["admin-branches", scopedBranchIds],
    queryFn: async () => {
      let q = supabase
        .from("branches")
        .select(
          "*, delivery_zones(id, name, is_active), branch_delivery_rates(id, max_distance_km, fee, sort_order)"
        )
        .order("created_at");
      if (scopedBranchIds && scopedBranchIds.length > 0) {
        q = q.in("id", scopedBranchIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as BranchRow[];
    },
  });

  const { data: storeAdmins = [] } = useQuery({
    queryKey: ["store-admins-for-branches"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "store_admin");
      if (error) throw error;
      const ids = [...new Set((roles || []).map((r) => r.user_id))];
      if (ids.length === 0) return [] as StoreAdmin[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .in("user_id", ids);
      return (profiles || []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        phone: p.phone,
      })) as StoreAdmin[];
    },
  });

  const { data: allAccess = [], isFetching: accessLoading } = useQuery({
    queryKey: ["admin-branch-access"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_branch_access" as any)
        .select("user_id, branch_id");
      if (error) throw error;
      return (data || []) as { user_id: string; branch_id: string }[];
    },
  });

  const managersByBranch = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of allAccess) {
      const list = map.get(row.branch_id) || [];
      list.push(row.user_id);
      map.set(row.branch_id, list);
    }
    return map;
  }, [allAccess]);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      if (!isSuperAdmin) throw new Error("not allowed");
      const { error } = await supabase.from("branches").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      toast.success("تم التحديث");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const saveManagersMutation = useMutation({
    mutationFn: async ({ branchId, userIds }: { branchId: string; userIds: string[] }) => {
      const current = allAccess.filter((a) => a.branch_id === branchId).map((a) => a.user_id);
      const toAdd = userIds.filter((id) => !current.includes(id));
      const toRemove = current.filter((id) => !userIds.includes(id));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("admin_branch_access" as any)
          .delete()
          .eq("branch_id", branchId)
          .in("user_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const { error } = await supabase.from("admin_branch_access" as any).insert(
          toAdd.map((user_id) => ({ user_id, branch_id: branchId }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branch-access"] });
      toast.success("تم تحديث مدراء الفرع");
      setManagersBranch(null);
    },
    onError: (e: any) => toast.error(e?.message || "تعذر حفظ المدراء"),
  });

  const saveRatesMutation = useMutation({
    mutationFn: async ({
      branchId,
      rates,
    }: {
      branchId: string;
      rates: { id?: string; max_distance_km: number; fee: number }[];
    }) => {
      const existing = ratesBranch?.branch_delivery_rates || [];
      const keepIds = rates.filter((r) => r.id).map((r) => r.id!);
      const toDelete = existing.filter((r) => !keepIds.includes(r.id)).map((r) => r.id);

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("branch_delivery_rates" as any)
          .delete()
          .in("id", toDelete);
        if (error) throw error;
      }

      for (let i = 0; i < rates.length; i++) {
        const r = rates[i];
        const row = {
          branch_id: branchId,
          max_distance_km: Number(r.max_distance_km),
          fee: Number(r.fee),
          sort_order: i,
        };
        if (r.id) {
          const { error } = await supabase
            .from("branch_delivery_rates" as any)
            .update(row)
            .eq("id", r.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("branch_delivery_rates" as any).insert(row);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      toast.success("تم حفظ شرائح التوصيل");
      setRatesBranch(null);
    },
    onError: (e: any) => toast.error(e?.message || "تعذر حفظ الأسعار"),
  });

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/?location=${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("تم نسخ رابط الفرع");
  };

  const openManagers = (branch: BranchRow) => {
    setManagersBranch(branch);
    setSelectedManagerIds([...(managersByBranch.get(branch.id) || [])]);
  };

  const openRates = (branch: BranchRow) => {
    const rates = [...(branch.branch_delivery_rates || [])].sort(
      (a, b) => a.max_distance_km - b.max_distance_km
    );
    setRatesBranch(branch);
    setRateDrafts(
      rates.length > 0
        ? rates.map((r) => ({
            id: r.id,
            max_distance_km: r.max_distance_km,
            fee: Number(r.fee),
          }))
        : [
            { max_distance_km: 3, fee: 10 },
            { max_distance_km: 7, fee: 18 },
            { max_distance_km: 15, fee: 28 },
          ]
    );
  };

  return (
    <>
      <Badge variant="outline" className="mb-4">
        {branches?.length ?? 0} فرع
      </Badge>
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {branches?.map((b) => {
            const rates = [...(b.branch_delivery_rates || [])].sort(
              (a, b) => a.max_distance_km - b.max_distance_km
            );
            const managerIds = managersByBranch.get(b.id) || [];
            return (
              <div key={b.id} className="bg-card rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{b.name}</h3>
                  {isSuperAdmin && (
                    <Switch
                      checked={b.is_active}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: b.id, value: v })}
                    />
                  )}
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  {b.city && <p className="font-medium text-foreground">{b.city}</p>}
                  {b.address && (
                    <p className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {b.address}
                    </p>
                  )}
                  {b.phone && <p>📞 {b.phone}</p>}
                  <p className="text-xs font-mono" dir="ltr">
                    ?location={b.slug}
                  </p>
                </div>

                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold">أسعار التوصيل حسب المسافة</p>
                    {(isSuperAdmin || (scopedBranchIds || []).includes(b.id)) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => openRates(b)}
                      >
                        <Pencil className="h-3.5 w-3.5 ml-1" />
                        تعديل
                      </Button>
                    )}
                  </div>
                  {rates.length === 0 ? (
                    <p className="text-muted-foreground">لا توجد شرائح بعد</p>
                  ) : (
                    rates.map((r) => (
                      <div key={r.id} className="flex justify-between">
                        <span>حتى {r.max_distance_km} كم</span>
                        <span className="font-medium">{r.fee} ر.س</span>
                      </div>
                    ))
                  )}
                </div>

                {isSuperAdmin && (
                  <div className="rounded-lg bg-muted/50 p-3 text-xs">
                    <p className="font-semibold mb-1">مدراء الفرع</p>
                    {accessLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : managerIds.length === 0 ? (
                      <p className="text-muted-foreground">لم يُعيَّن مدراء بعد</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {managerIds.map((uid) => {
                          const admin = storeAdmins.find((a) => a.user_id === uid);
                          return (
                            <Badge key={uid} variant="secondary">
                              {admin?.full_name || uid.slice(0, 8)}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Badge variant={b.is_active ? "default" : "secondary"}>
                    {b.is_active ? "مفعّل" : "معطّل"}
                  </Badge>
                  <Badge variant="outline">{b.delivery_zones?.length || 0} نطاق جغرافي</Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setZonesBranch(b)}
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    مضلعات التوصيل
                  </Button>
                  {isSuperAdmin && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => openManagers(b)}
                    >
                      <Users className="h-3.5 w-3.5" />
                      تعيين المدراء
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => copyLink(b.slug)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    نسخ الرابط
                    <Copy className="h-3 w-3 opacity-60" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Zones map dialog */}
      <Dialog open={!!zonesBranch} onOpenChange={(open) => !open && setZonesBranch(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapIcon className="h-5 w-5 text-primary" />
              مضلعات التوصيل — {zonesBranch?.name}
            </DialogTitle>
          </DialogHeader>
          {zonesBranch && (
            <DeliveryZonesEditor
              key={zonesBranch.id}
              branchId={zonesBranch.id}
              branchName={zonesBranch.name}
              branchCenter={
                zonesBranch.lat != null && zonesBranch.lng != null
                  ? { lat: Number(zonesBranch.lat), lng: Number(zonesBranch.lng) }
                  : null
              }
              mapHeightClass="h-[420px]"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Managers dialog */}
      <Dialog open={!!managersBranch} onOpenChange={(open) => !open && setManagersBranch(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              مدراء فرع {managersBranch?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            اختر مشرفي المتجر المسموح لهم بإدارة هذا الفرع فقط. يجب أن يكون لديهم صلاحية «مشرف المتجر».
          </p>
          {storeAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              لا يوجد مشرفو متجر. أضفهم من الإعدادات ← المشرفين والصلاحيات.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {storeAdmins.map((admin) => {
                const checked = selectedManagerIds.includes(admin.user_id);
                return (
                  <label
                    key={admin.user_id}
                    className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setSelectedManagerIds((prev) =>
                          v
                            ? [...prev, admin.user_id]
                            : prev.filter((id) => id !== admin.user_id)
                        );
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium">{admin.full_name || "بدون اسم"}</p>
                      <p className="text-xs text-muted-foreground">{admin.phone || admin.user_id.slice(0, 8)}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() =>
                managersBranch &&
                saveManagersMutation.mutate({
                  branchId: managersBranch.id,
                  userIds: selectedManagerIds,
                })
              }
              disabled={!managersBranch || saveManagersMutation.isPending}
            >
              {saveManagersMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              حفظ المدراء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rates dialog */}
      <Dialog open={!!ratesBranch} onOpenChange={(open) => !open && setRatesBranch(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>شرائح التوصيل — {ratesBranch?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {rateDrafts.map((r, idx) => (
              <div key={r.id || `new-${idx}`} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">حتى (كم)</Label>
                  <Input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={r.max_distance_km}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRateDrafts((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, max_distance_km: v } : row))
                      );
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">الرسوم (ر.س)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={r.fee}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRateDrafts((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, fee: v } : row))
                      );
                    }}
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setRateDrafts((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRateDrafts((prev) => [
                  ...prev,
                  {
                    max_distance_km: (prev[prev.length - 1]?.max_distance_km || 0) + 5,
                    fee: 10,
                  },
                ])
              }
            >
              <Plus className="h-4 w-4 ml-1" />
              إضافة شريحة
            </Button>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                ratesBranch &&
                saveRatesMutation.mutate({ branchId: ratesBranch.id, rates: rateDrafts })
              }
              disabled={!ratesBranch || saveRatesMutation.isPending || rateDrafts.length === 0}
            >
              {saveRatesMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              حفظ الشرائح
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const AdminBranchesPage = () => (
  <AdminLayout title="إدارة الفروع">
    <AdminBranchesContent />
  </AdminLayout>
);

export default AdminBranchesPage;
