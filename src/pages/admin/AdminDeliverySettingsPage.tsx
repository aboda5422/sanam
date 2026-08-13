import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Loader2, Pencil, Plus, Trash2, Map as MapIcon, MapPin } from "lucide-react";
import { toast } from "sonner";
import DeliveryZonesEditor from "@/components/admin/DeliveryZonesEditor";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type BranchRow = {
  id: string;
  name: string;
  city?: string | null;
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

const useSetting = (key: string, defaultValue: any) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["store-settings", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return data?.value ?? defaultValue;
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: any) => {
      const { error } = await supabase
        .from("store_settings")
        .upsert({ key, value }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-settings", key] });
      toast.success("تم الحفظ بنجاح");
    },
    onError: () => toast.error("حدث خطأ أثناء الحفظ"),
  });

  return { data: data ?? defaultValue, isLoading, save: mutation.mutate, saving: mutation.isPending };
};

const AdminDeliverySettingsPage = () => {
  const queryClient = useQueryClient();
  const { isSuperAdmin, scopedBranchIds } = useAdminAuth();
  const { data, isLoading, save, saving } = useSetting("delivery", {
    delivery_fee: 10,
    free_delivery_threshold: 100,
    min_order: 20,
    work_start: "08:00",
    work_end: "23:00",
  });
  const [form, setForm] = useState<any>(null);
  const d = form ?? data;

  const [zonesBranch, setZonesBranch] = useState<BranchRow | null>(null);
  const [ratesBranch, setRatesBranch] = useState<BranchRow | null>(null);
  const [rateDrafts, setRateDrafts] = useState<
    { id?: string; max_distance_km: number; fee: number }[]
  >([]);

  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ["admin-branches-delivery", scopedBranchIds],
    queryFn: async () => {
      let q = supabase
        .from("branches")
        .select(
          "id, name, city, lat, lng, is_active, delivery_zones(id, name, is_active), branch_delivery_rates(id, max_distance_km, fee, sort_order)",
        )
        .order("name");
      if (scopedBranchIds && scopedBranchIds.length > 0) {
        q = q.in("id", scopedBranchIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as BranchRow[];
    },
  });

  const visibleBranches = useMemo(
    () => (isSuperAdmin ? branches : branches.filter((b) => b.is_active)),
    [branches, isSuperAdmin],
  );

  const saveRatesMutation = useMutation({
    mutationFn: async ({
      branchId,
      rates,
      existing,
    }: {
      branchId: string;
      rates: { id?: string; max_distance_km: number; fee: number }[];
      existing: BranchRow["branch_delivery_rates"];
    }) => {
      const keepIds = rates.filter((r) => r.id).map((r) => r.id!);
      const toDelete = (existing || []).filter((r) => !keepIds.includes(r.id)).map((r) => r.id);

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
      queryClient.invalidateQueries({ queryKey: ["admin-branches-delivery"] });
      queryClient.invalidateQueries({ queryKey: ["admin-branches"] });
      queryClient.invalidateQueries({ queryKey: ["branch-delivery-rates"] });
      toast.success("تم حفظ شرائح التوصيل");
      setRatesBranch(null);
    },
    onError: (e: any) => toast.error(e?.message || "تعذر حفظ الأسعار"),
  });

  const openRates = (branch: BranchRow) => {
    const rates = [...(branch.branch_delivery_rates || [])].sort(
      (a, b) => a.max_distance_km - b.max_distance_km,
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
          ],
    );
  };

  return (
    <AdminLayout title="إعدادات التوصيل">
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8 max-w-5xl">
          <section className="space-y-4">
            <div>
              <h2 className="font-semibold text-lg">الإعدادات العامة</h2>
              <p className="text-sm text-muted-foreground">رسوم افتراضية وأوقات العمل للمتجر</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>رسوم التوصيل (ر.س)</Label>
                <Input
                  type="number"
                  value={d.delivery_fee}
                  onChange={(e) => setForm({ ...d, delivery_fee: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>توصيل مجاني فوق (ر.س)</Label>
                <Input
                  type="number"
                  value={d.free_delivery_threshold}
                  onChange={(e) => setForm({ ...d, free_delivery_threshold: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>أقل طلب (ر.س)</Label>
                <Input
                  type="number"
                  value={d.min_order}
                  onChange={(e) => setForm({ ...d, min_order: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>بداية الدوام</Label>
                <Input
                  type="time"
                  value={d.work_start}
                  onChange={(e) => setForm({ ...d, work_start: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div>
                <Label>نهاية الدوام</Label>
                <Input
                  type="time"
                  value={d.work_end}
                  onChange={(e) => setForm({ ...d, work_end: e.target.value })}
                  dir="ltr"
                />
              </div>
            </div>
            <Button onClick={() => save(form ?? d)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
              حفظ الإعدادات العامة
            </Button>
          </section>

          <section className="space-y-4 border-t pt-6">
            <div>
              <h2 className="font-semibold text-lg">التوصيل حسب الفرع</h2>
              <p className="text-sm text-muted-foreground">
                شرائح الأسعار حسب المسافة، النطاق الجغرافي، ومضلعات التوصيل لكل فرع
              </p>
            </div>

            {branchesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                {visibleBranches.map((b) => {
                  const rates = [...(b.branch_delivery_rates || [])].sort(
                    (a, c) => a.max_distance_km - c.max_distance_km,
                  );
                  const zonesCount = b.delivery_zones?.length || 0;
                  return (
                    <div key={b.id} className="bg-card rounded-xl border p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">{b.name}</h3>
                          {b.city && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3.5 w-3.5" />
                              {b.city}
                            </p>
                          )}
                        </div>
                        <Badge variant={b.is_active ? "default" : "secondary"}>
                          {b.is_active ? "مفعّل" : "معطّل"}
                        </Badge>
                      </div>

                      <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold">أسعار التوصيل حسب المسافة</p>
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

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{zonesCount} نطاق جغرافي</Badge>
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
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

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
                        prev.map((row, i) => (i === idx ? { ...row, max_distance_km: v } : row)),
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
                        prev.map((row, i) => (i === idx ? { ...row, fee: v } : row)),
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
            <Button variant="outline" onClick={() => setRatesBranch(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() =>
                ratesBranch &&
                saveRatesMutation.mutate({
                  branchId: ratesBranch.id,
                  rates: rateDrafts,
                  existing: ratesBranch.branch_delivery_rates,
                })
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
    </AdminLayout>
  );
};

export default AdminDeliverySettingsPage;
